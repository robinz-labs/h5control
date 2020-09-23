#include "http_server.h"
#include "http_socket.h"

HttpServer::HttpServer(QObject *parent) :
    QTcpServer(parent)
{
    _isLoggerEnanbled = true;
    _strFilesPath = "/";
}

void HttpServer::setFilesPath(QString path)
{
    _strFilesPath = path;
}

QString HttpServer::filesPath()
{
    return _strFilesPath;
}

void HttpServer::incomingConnection(qintptr socketId)
{
    HttpSocket *socket = new HttpSocket(this);
    socket->setSocketDescriptor(socketId);
    socket->setLoggerEnabled(_isLoggerEnanbled);
    connect(socket, SIGNAL(httpRequestReceived(QString,QStringList,QString&)),
            this, SLOT(handleHttpRequestReceived(QString,QStringList,QString&)));
}

void HttpServer::handleHttpRequestReceived(
        const QString & contentPath,
        const QStringList & parameters,
        QString & response)
{
    emit httpRequestReceived(contentPath, parameters, response);
}


