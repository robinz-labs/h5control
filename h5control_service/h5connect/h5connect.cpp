#include <QtCore>
#include <QSerialPortInfo>

#include "h5connect.h"
#include "h5connect_gui.h"
#include "rioc_service.h"
#include "com_handler.h"
#include "http_server.h"
#include "http_socket.h"
#include "http_request_handler.h"

H5Connect* g_h5connect = NULL;

H5Connect::H5Connect(QObject *parent) : QObject(parent)
{
    g_h5connect = this;
    qDebug("h5connect %p started", g_h5connect);

    _websocketIsReady = false;
    _httpIsReady = false;
    _udpIsReady = false;

    // load settings from file
    QString strSettingsFile = QCoreApplication::applicationDirPath() + "/settings.json";
    QFile settingsFile(strSettingsFile);
    if (!settingsFile.open(QIODevice::ReadOnly)) {

        qWarning("can not open settings file.");

    } else {

        QByteArray settingsData = settingsFile.readAll();
        QJsonDocument settingsDoc(QJsonDocument::fromJson(settingsData));
        _settings = settingsDoc.object();
    }

    // start rioc service
    _rioc = new RiocService();
    connect(_rioc, SIGNAL(riocMessageReceived(unsigned char,unsigned char,QByteArray)),
            this, SLOT(handleRiocMessageReceived(unsigned char,unsigned char,QByteArray)));

    // enable logger
    _isLoggerEnanbled = _settings["logger-enabled"].toInt();
    _rioc->setLoggerEnabled(_isLoggerEnanbled);

    // start websocket service
    _websocketServer = new QWebSocketServer(QString("RIOC"), QWebSocketServer::NonSecureMode, this);
    _websocketRioc = NULL;
    _websocketManager = NULL;

    int websocketPort = _settings["service"].toObject()["websocket-port"].toInt();
    if (websocketPort > 0) {
        _websocketIsReady = startWebsocketService(websocketPort);
    }

    // start http service
    _httpServer = NULL;
    int httpPort = _settings["service"].toObject()["http-port"].toInt();
    if (httpPort > 0) {
        _httpIsReady = startHttpService(httpPort);
    }

    // start udp service
    _udp = NULL;

    int udpInPort = _settings["service"].toObject()["udp-in-port"].toInt();
    int udpOutPort = _settings["service"].toObject()["udp-out-port"].toInt();
    QString udpOutHost = _settings["service"].toObject()["udp-out-host"].toString();

    bool needStartUdpService = false;
    if (udpInPort>0 && udpOutPort>0 && !udpOutHost.isEmpty()) {
        needStartUdpService = true;
        _udpIsReady = startUdpService(udpInPort, udpOutHost, udpOutPort);
    }

    // make connections
    QJsonArray messages = _settings["initialized-messages"].toArray();
    if (needStartUdpService || messages.size()>0) {
        connectSerials();
    }

    // send initialized messages
    for (int n = 0; n < messages.size(); n++) {
        QJsonObject message = messages[n].toObject();

        int fromID = message["from"].toInt(0);
        int toID = message["to"].toInt(0xFF);
        QString strData = message["data"].toString();
        if (!strData.isEmpty()) {
            QByteArray data = QByteArray::fromHex(strData.toUtf8());
            if (data.length()==8)
                _rioc->sendRiocMessage(fromID, toID, data);
        }

        int wait = message["wait"].toInt(0);
        if (wait>0) QThread::msleep(wait);
    }

    // set messaging interval
    int messagingInterval = _settings["messaging-interval"].toInt(0);
    if (messagingInterval>0) {
        if (messagingInterval>1000) messagingInterval = 1000;
        _rioc->setMessagingInterval(messagingInterval);
    }
}

H5Connect::~H5Connect()
{
    _websocketServer->close();
    _websocketServer->deleteLater();

    if (_websocketRioc!=NULL) {
        _websocketRioc->close();
        _websocketRioc->deleteLater();
    }

    if (_websocketManager!=NULL) {
        _websocketManager->close();
        _websocketManager->deleteLater();
    }

    if (_httpServer!=NULL) {
        _httpServer->close();
        _httpServer->deleteLater();
    }

    if (_httpRequestHandler!=NULL) {
        _httpRequestHandler->deleteLater();
    }

    if (_udp!=NULL) {
        _udp->close();
        _udp->deleteLater();
    }

    _rioc->clearSerialConnections();
    _rioc->deleteLater();

    qDebug("h5connect %p stopped", this);
}

void H5Connect::restart()
{
    // send message to manager
    QJsonObject report;
    report["event"] = "restart";
    report["http-port"] = _settings["service"].toObject()["http-port"].toInt();
    reportToManager(report);

    // close all in old
    _websocketServer->close();
    if (_websocketRioc!=NULL) _websocketRioc->close();
    if (_websocketManager!=NULL) _websocketManager->close();
    if (_httpServer!=NULL) _httpServer->close();
    if (_udp!=NULL) _udp->close();
    _rioc->clearSerialConnections();

    // create new
    g_h5connect = new H5Connect();

    // release old
    this->deleteLater();
}

bool H5Connect::startWebsocketService(int websocketPort)
{
    if (!_websocketServer->listen(QHostAddress::Any, websocketPort)) {
        qWarning("error: failed to start websocket service at port %d .", websocketPort);
        return false;
    }

    connect(_websocketServer, SIGNAL(newConnection()), this, SLOT(handleWebsocketConnected()));
    qDebug("websocket service at port %d is ready.", websocketPort);
    return true;
}

bool H5Connect::startHttpService(int httpPort)
{
    _httpServer = new HttpServer();
    _httpServer->setLoggerEnabled(_isLoggerEnanbled);
    _httpServer->setFilesPath(QCoreApplication::applicationDirPath() + "/web/");
    if (!_httpServer->listen(QHostAddress::Any, httpPort)) {
        qWarning("error: failed to start http service at port %d .", httpPort);
    }

    connect(_httpServer, SIGNAL(httpRequestReceived(QString,QStringList,QString&)),
            this, SLOT(handleHttpRequestReceived(QString,QStringList,QString&)));
    qDebug("http service at port %d is ready.", httpPort);

    _httpRequestHandler = new HttpRequestHandler(this);
    return true;
}

bool H5Connect::startUdpService(int udpInPort, const QString & udpOutHost, int udpOutPort)
{
    if (_udp==NULL) _udp = new QUdpSocket(this);
    if (!_udp->bind(udpInPort)) {
        qWarning("error: failed to start udp service at port %d .", udpInPort);
        return false;
    }

    _udpOutHost.setAddress(udpOutHost);
    _udpOutPort = udpOutPort;

    connect(_udp, SIGNAL(readyRead()), this, SLOT(handleUdpDatagramReceived()));
    qDebug("udp service at port %d is ready.", udpInPort);
    return true;
}

void H5Connect::connectSerials()
{
    QJsonObject report;
    report["event"] = "rioc-connect";

    QJsonArray connections = _settings["connections"].toArray();

    for (int n = 0; n < connections.size(); n++) {
        QJsonObject connection = connections[n].toObject();

        bool isDisabled = connection["_disabled"].toInt();
        if (isDisabled) continue;

        QString port = connection["port"].toString();
        QString description = connection["description"].toString();
        QString manufacturer = connection["manufacturer"].toString();
        int vid = connection["vid"].toInt();
        int pid = connection["pid"].toInt();
        int baud = connection["baud"].toInt();
        if (baud==0) baud=115200;

        if (!port.isEmpty()) {

            // add serial with specified port name
            bool done = _rioc->addSerialConnection(port, baud);

            report["index"] = n;
            report["port"] = port;
            report["done"] = done;
            reportToManager(report);

        } else {

            // add serials with specified vid/pid
            foreach (const QSerialPortInfo &serialPortInfo, QSerialPortInfo::availablePorts()) {

                if (serialPortInfo.isBusy()) continue;

                bool found = false;

                if (vid!=0 && serialPortInfo.hasVendorIdentifier() &&
                    serialPortInfo.vendorIdentifier()==vid) {

                    if (pid!=0) {
                        // need check pid also
                        if (serialPortInfo.hasProductIdentifier() &&
                            serialPortInfo.productIdentifier()==pid) {
                            found = true;
                        }
                    } else {
                        // not need check pid
                        found = true;
                    }
                }

                if (!description.isEmpty() &&
                    serialPortInfo.description().contains(description)) {
                    found = true;
                }

                if (!manufacturer.isEmpty() &&
                    serialPortInfo.manufacturer().contains(manufacturer)) {
                    found = true;
                }

                if (found) {
                    port = serialPortInfo.portName();
                    bool done = _rioc->addSerialConnection(port, baud);

                    report["index"] = n;
                    report["port"] = port;
                    report["done"] = done;
                    reportToManager(report);
                }
            }
        }
    }
}

bool H5Connect::saveSettings()
{
    QJsonDocument settingsDoc(_settings);
    QByteArray settingsData = settingsDoc.toJson();

    QString strSettingsFile = QCoreApplication::applicationDirPath() + "/settings.json";
    QFile settingsFile(strSettingsFile);
    if (!settingsFile.open(QIODevice::WriteOnly)) {

        qWarning("can not write settings file.");

    } else {

        settingsFile.write(settingsData);
        settingsFile.close();
        return true;
    }

    return false;
}

void H5Connect::reportToManager(const QJsonObject & msg)
{
    if (_websocketManager == NULL) return;

    QJsonDocument json(msg);
    QString strJson = QString::fromUtf8(json.toJson());

    _websocketManager->sendTextMessage(strJson);
    _websocketManager->flush();
}

void H5Connect::handleWebsocketConnected()
{
    QWebSocket *websocket = _websocketServer->nextPendingConnection();

    connect(websocket, SIGNAL(textMessageReceived(QString)), this, SLOT(handleWebsocketMessageReceived(QString)));
    connect(websocket, SIGNAL(disconnected()), this, SLOT(handleWebsocketDisconnected()));

    qDebug("websocket request %s is accepted.",
           websocket->requestUrl().toDisplayString().toLocal8Bit().constData());
    qDebug("websocket %p is connected.", websocket);

    bool isManagerRequest = websocket->requestUrl().toDisplayString().endsWith("/manager");
    bool isRiocRequest = !isManagerRequest;

    if (isManagerRequest) {

        if (_websocketManager != NULL) {
            _websocketManager->close();
            //delete _websocketManager;
        }
        _websocketManager = websocket;

    } else if (isRiocRequest) {

        if (_websocketRioc != NULL) {
            _websocketRioc->close();
            //delete _websocketRioc;
        }
        _websocketRioc = websocket;

        // send message to manager
        QJsonObject report;
        report["event"] = "rioc-refresh-begin";
        reportToManager(report);

        // close all connections to rioc serials
        _rioc->clearSerialConnections();

        // open connections to rioc serials
        connectSerials();

        // send message to notify websocket client
        QString msg;
        msg = msg.sprintf("0000000080%02x0000000000", _rioc->getSerialCount()&0xff);
        _websocketRioc->sendTextMessage(msg);

        // send message to manager
        report["event"] = "rioc-refresh-finish";
        report["count"] = _rioc->getSerialCount();
        reportToManager(report);
    }
}

void H5Connect::handleWebsocketMessageReceived(const QString & message)
{
    QWebSocket *websocket = qobject_cast<QWebSocket *>(sender());

    if (websocket == _websocketRioc) {
        QByteArray datagram = QByteArray::fromHex(message.toUtf8());
        if (datagram.length()==11 && datagram.at(0)==0x00) {

            unsigned char fromID = datagram.at(1);
            unsigned char toID   = datagram.at(2);
            _rioc->sendRiocMessage(fromID, toID, datagram.remove(0,3));
        }
    }
}

void H5Connect::handleWebsocketDisconnected()
{
    QWebSocket *websocket = qobject_cast<QWebSocket *>(sender());
    qDebug("websocket %p is disconnected.", websocket);

    if (websocket == _websocketManager) {

        _websocketManager = NULL;

    } else if (websocket == _websocketRioc) {

        _websocketRioc = NULL;
    }

    websocket->deleteLater();
}

void H5Connect::handleHttpRequestReceived(
        const QString & contentPath,
        const QStringList & parameters,
        QString & response)
{
    if (contentPath=="rioc/send" || contentPath=="rioc/sendAndWait") {

        // rioc requests

        QString message = HttpSocket::getParameter(parameters, "msg");
        int timeout = HttpSocket::getParameter(parameters, "timeout").toInt();
        QByteArray dataOut = QByteArray::fromHex(message.toUtf8());
        QByteArray dataIn;
        if (dataOut.length()==11 && dataOut.at(0)==0x00) {

            unsigned char fromID = dataOut.at(1);
            unsigned char toID   = dataOut.at(2);

            dataOut.remove(0,3); // only 8-byte message data

            if (contentPath=="rioc/send") {
                // send message without waiting response
                _rioc->sendRiocMessage(fromID, toID, dataOut);
                response = "";
            } else {
                // send message and waiting response
                if (timeout==0) timeout = 1000; // default timeout
                if (_rioc->sendRiocMessageAndWaitResponse(fromID, toID, dataOut, dataIn, (double)timeout*0.001)) {
                    unsigned char leadingBytes[] = { 0x00, toID, fromID }; // swap fromID and toID
                    dataIn.insert(0, (const char*)leadingBytes, 3); // add 3-byte leading data
                    response = QString::fromUtf8(dataIn.toHex());
                } else {
                    response = "";
                }
            }
        }

    } else if (_httpRequestHandler != NULL) {

        // other requests

        response = _httpRequestHandler->processHttpRequest(contentPath, parameters);
    }
}

void H5Connect::handleUdpDatagramReceived()
{
    QByteArray datagram;
    QHostAddress host;
    quint16 port;

    do {
        datagram.resize(_udp->pendingDatagramSize());
        _udp->readDatagram(datagram.data(), datagram.size(), &host, &port);

        if (datagram.length()==11 && datagram.at(0)==0x00) {

            unsigned char fromID = datagram.at(1);
            unsigned char toID   = datagram.at(2);
            _rioc->sendRiocMessage(fromID, toID, datagram.remove(0,3));
        }

    } while (_udp->hasPendingDatagrams());
}

void H5Connect::handleRiocMessageReceived(unsigned char fromID, unsigned char toID, const QByteArray & data)
{
    if (data.length()!=8) return; // data length must be 8

    const char bytes[] =
        { 0x00,
          (char)fromID,
          (char)toID,
          data[0], data[1], data[2], data[3],
          data[4], data[5], data[6], data[7]
        };
    QByteArray datagram(bytes, sizeof(bytes));

    // repeat the message via websocket
    if (_websocketRioc != NULL)
        _websocketRioc->sendTextMessage(QString::fromUtf8(datagram.toHex()));

    // repeat the message via udp
    if (_udp != NULL)
        _udp->writeDatagram(datagram, _udpOutHost, _udpOutPort);
}
