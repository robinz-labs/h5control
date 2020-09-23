#ifndef H5CONNECT_H
#define H5CONNECT_H

#define H5CONNECT_VERSION   "0.3"

#include <QObject>
#include <QJsonObject>
#include <QWebSocketServer>
#include <QWebSocket>
#include <QUdpSocket>
#include <QHostAddress>

class RiocService;
class HttpServer;
class HttpRequestHandler;

class H5Connect : public QObject
{
    Q_OBJECT
public:
    explicit H5Connect(QObject *parent = 0);
    ~H5Connect();

    void restart();

    bool startWebsocketService(int websocketPort);
    bool startHttpService(int httpPort);
    bool startUdpService(int udpInPort, const QString & udpOutHost, int udpOutPort);

    void connectSerials();

    QJsonObject & settings() { return _settings; }
    bool saveSettings();

    void reportToManager(const QJsonObject & msg);

    bool websocketIsReady() { return _websocketIsReady; }
    bool httpIsReady()      { return _httpIsReady; }
    bool udpIsReady()       { return _udpIsReady; }

signals:

private slots:
    void handleWebsocketConnected();
    void handleWebsocketDisconnected();
    void handleWebsocketMessageReceived(const QString & message);

    void handleHttpRequestReceived(
            const QString & contentPath,
            const QStringList & parameters,
            QString & response);

    void handleUdpDatagramReceived();

    void handleRiocMessageReceived(unsigned char fromID, unsigned char toID, const QByteArray & data);

private:

    bool _isLoggerEnanbled;
    QJsonObject _settings;

    bool _websocketIsReady;
    QWebSocketServer *_websocketServer;
    QWebSocket *_websocketRioc;
    QWebSocket *_websocketManager;

    bool _httpIsReady;
    HttpServer *_httpServer;
    HttpRequestHandler *_httpRequestHandler;

    bool _udpIsReady;
    QUdpSocket *_udp;
    QHostAddress _udpOutHost;
    int _udpOutPort;

    RiocService* _rioc;
};

extern H5Connect* g_h5connect;

#endif // H5CONNECT_H
