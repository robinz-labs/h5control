#include <QSerialPortInfo>
#include <QJsonArray>
#include <QJsonDocument>

#include "http_request_handler.h"
#include "h5connect.h"
#include "http_socket.h"

HttpRequestHandler::HttpRequestHandler(QObject *parent) : QObject(parent)
{
    _h5connect = (H5Connect*)parent;
}

QString HttpRequestHandler::processHttpRequest(const QString & contentPath, const QStringList & parameters)
{
    if (contentPath == "") {
        return gotoDefaultPage("/manager/index.html");
    } else if (contentPath == "restart") {
        return restartSystem();
    } else if (contentPath == "sysinfo/version") {
        return getSystemInfo();
    } else if (contentPath == "sysinfo/ports") {
        return listSerialPorts();
    } else if (contentPath == "settings/readAll") {
        return readAllSettings();
    } else if (contentPath == "settings/write") {
        QString strGroup = HttpSocket::getParameter(parameters, "group");
        QString strKey   = HttpSocket::getParameter(parameters, "key");
        QString strValue = HttpSocket::getParameter(parameters, "value");
        QString strText  = HttpSocket::getParameter(parameters, "text");
        QString strJson  = HttpSocket::getParameter(parameters, "json");

        QJsonValue val;
        if (!strValue.isNull()) {
            val = QJsonValue(strValue.toInt());
        } else if (!strText.isNull()) {
            val = QJsonValue(strText);
        } else if (!strJson.isNull()) {
            QJsonDocument json(QJsonDocument::fromJson(strJson.toUtf8()));
            if (json.isArray()) val = json.array();
            else if (json.isObject()) val = json.object();
        }

        if (!val.isNull())
            return writeSetting(strGroup, strKey, val);

    } else if (contentPath == "settings/saveAll") {
        return saveAllSettings();
    }

    return "";
}

QString HttpRequestHandler::gotoDefaultPage(const QString & url)
{
    return QString("<html><head><meta http-equiv=\"refresh\" content=\"0; url=%1\"></head></html>").arg(url);
}

QString HttpRequestHandler::restartSystem()
{
    _h5connect->restart();
    return "";
}

QString HttpRequestHandler::getSystemInfo()
{
    QJsonObject info;
    info["name"] = "h5connect";
    info["version"] = H5CONNECT_VERSION;

    QJsonDocument json(info);
    return QString::fromUtf8(json.toJson());
}

QString HttpRequestHandler::listSerialPorts()
{
    QJsonArray ports;

    foreach (const QSerialPortInfo &serialPortInfo, QSerialPortInfo::availablePorts()) {

        QJsonObject port;
        port["port"] = serialPortInfo.portName();
        port["location"] = serialPortInfo.systemLocation();
        port["description"] = serialPortInfo.description();
        port["manufacturer"] = serialPortInfo.manufacturer();
        port["vid"] = serialPortInfo.vendorIdentifier();
        port["pid"] = serialPortInfo.productIdentifier();
        port["busy"] = serialPortInfo.isBusy();

        ports.append(port);
    }

    QJsonDocument json(ports);
    return QString::fromUtf8(json.toJson());
}

QString HttpRequestHandler::readAllSettings()
{
    QJsonObject & settings = _h5connect->settings();
    QJsonDocument json(settings);
    return QString::fromUtf8(json.toJson());
}


QString HttpRequestHandler::writeSetting(const QString & group, const QString & key, const QJsonValue & val)
{
    bool done = false;

    QJsonObject & settings = _h5connect->settings();
    if (!key.isEmpty()) {
        if (group.isEmpty())
            settings[key] = val;
        else {
            QJsonObject groupSettings = settings[group].toObject();
            groupSettings[key] = val;
            settings[group] = groupSettings;
        }
        done = true;
    }

    QJsonObject result;
    result["done"] = done;
    return QString::fromUtf8(QJsonDocument(result).toJson());
}

QString HttpRequestHandler::saveAllSettings()
{
    bool done = _h5connect->saveSettings();

    QJsonObject result;
    result["done"] = done;
    return QString::fromUtf8(QJsonDocument(result).toJson());
}
