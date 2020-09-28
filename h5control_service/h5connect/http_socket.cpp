#include <string.h>
#include <QtNetwork>

#include "http_socket.h"
#include "http_server.h"

#define REQUEST_BUFFER_SIZE 1024 * 1024 // 1M

HttpSocket::HttpSocket(QObject *parent) :
    QTcpSocket(parent)
{   
    _isLoggerEnanbled = true;

    // init buffer
    _bufRequest = (char*)malloc(REQUEST_BUFFER_SIZE);
    _lenBufRequest = 0;

    // create connections
    connect(this, SIGNAL(readyRead()), this, SLOT(readClient()));
    connect(this, SIGNAL(disconnected()), this, SLOT(deleteLater()));
}

HttpSocket::~HttpSocket()
{
    // release buffer
    free(_bufRequest);
}

void HttpSocket::readClient()
{
    // calculate unused buffer size
    // when the buffer is full, drop all data saved in the buffer
    int lenUnusedBuf = REQUEST_BUFFER_SIZE - _lenBufRequest;
    if (lenUnusedBuf<=1) {
        _lenBufRequest = 0;
        lenUnusedBuf = REQUEST_BUFFER_SIZE;
    }

    // read incoming data
    QDataStream in(this);
    int len = in.readRawData(_bufRequest+_lenBufRequest, lenUnusedBuf-1);
    _lenBufRequest += len;
    _bufRequest[_lenBufRequest]=0;

    // drop incoming data that is out of buffer
    char buf[255];
    while (in.readRawData(buf, sizeof(buf)) > 0) {}

    // when detected the ending charaters are <cr><lf>, then execute the command
    if (_lenBufRequest >= 2 &&
        _bufRequest[_lenBufRequest-2]=='\r' &&
        _bufRequest[_lenBufRequest-1]=='\n') {

        processHttpRequest();
        _lenBufRequest = 0;
    }
}

void HttpSocket::processHttpRequest()
{    
    QString strHttpAll(QByteArray(_bufRequest, _lenBufRequest));

    // get http request head and body
    // body is only available for POST method
    QStringList lstHttpAll = strHttpAll.split("\r\n\r\n");
    QString strHttpHead = lstHttpAll[0];
    QString strHttpBody;
    if (lstHttpAll.count()==2) strHttpBody = lstHttpAll[1];

    QString strRequest;         // example: /myapp/test.js?id=12345
    QString strContentPath;     //          myapp/test.js
    QString strContentType;     //          application/javascript
    QStringList lstParameters;  //          id=12345

    // process http head
    QString strRequestLine = strHttpHead.split("\r\n")[0];
    QStringList lstRequest = strRequestLine.split(" ");

    if (lstRequest.count()>=2 && (lstRequest[0]=="GET" || lstRequest[0]=="POST")) {
        strRequest = lstRequest[1];

        if (strRequest.startsWith("/")) {

            QStringList lstRequestParts = strRequest.split("?");

            // get content path
            strContentPath = lstRequestParts[0].mid(1); // remove heading slash

            // determine content type
            strContentType = getFileType(strContentPath);

            // get query parameters
            if (lstRequestParts.count()==2) {
                lstParameters = lstRequestParts[1].split("&"); // get parameters
            }
        }
    }

    // process http body (optional for POST method only)
    if (lstRequest[0]=="POST" && !strHttpBody.isEmpty()) {
        lstParameters.append(strHttpBody.split("&"));
    }

    if (_isLoggerEnanbled) {
        qDebug("content path = %s", strContentPath.toLocal8Bit().constData());
        qDebug("content type = %s", strContentType.toLocal8Bit().constData());
        for (int n=0 ; n<lstParameters.count() ; n++)
            qDebug("parameter[%d] = %s", n, lstParameters[n].toLocal8Bit().constData());
    }

    if (!strContentPath.isEmpty() && !strContentType.isEmpty()) {

        // transfer a file
        QString strFilePath = ((HttpServer*)parent())->filesPath() + strContentPath;

        if (!strContentPath.contains("../") && !strContentPath.contains("/..") &&
            QFile::exists(strFilePath)) {

            if (_isLoggerEnanbled) {
                qDebug("transfer http file %s", strContentPath.toLocal8Bit().constData());
            }

            QDataStream out(this);
            transferFile(out, strFilePath, strContentType);
        }

    } else {

        // process a request
        QString strResponse;
        emit httpRequestReceived(strContentPath, lstParameters, strResponse);

        if (!strResponse.isNull()) {
            QDataStream out(this);
            outputHttpHead(out, "text/html");
            QByteArray bytesResponse = strResponse.toUtf8();
            out.writeRawData(bytesResponse.constData(), bytesResponse.size());
        }
   }

    close();
}

void HttpSocket::transferFile(QDataStream & out, const QString & strFilePath, const QString & strFileType)
{
    QString strHttpHead = "HTTP/1.0 200 Ok\r\nContent-Type: " + strFileType + "\r\nAccess-Control-Allow-Origin: *\r\n\r\n";
    const char* szHttpHead = strHttpHead.toUtf8().constData();
    out.writeRawData(szHttpHead, strlen(szHttpHead));

    QFile file(strFilePath);
    if (file.open(QIODevice::ReadOnly)) {

        char buf[1024];
        while (!file.atEnd()) {
            int len = file.read(buf, sizeof(buf));
            if (len > 0)
                out.writeRawData(buf, len);
        }

        file.close();
    }
}

void HttpSocket::outputHttpHead(QDataStream & out, const QString & strFileType)
{
    QString strHttpHead =
            "HTTP/1.0 200 Ok\r\nContent-Type: " +
            (strFileType.isNull() ? "text/html" : strFileType) +
            "; charset=\"utf-8\"\r\nAccess-Control-Allow-Origin: *\r\n\r\n";
    const char* szHttpHead = strHttpHead.toUtf8().constData();
    out.writeRawData(szHttpHead, strlen(szHttpHead));
}

void HttpSocket::outputSystemInfo(QDataStream & out)
{
    QString strHTML = "";  // nothing

    const char* szHTML = strHTML.toUtf8().constData();
    out.writeRawData(szHTML, strlen(szHTML));
}

QString HttpSocket::getFileType(const QString & strFileName)
{
    QString strFileName1 = strFileName.toLower();

    if (strFileName1.endsWith(".html") || strFileName1.endsWith(".htm"))
                                            return "text/html";
    else if (strFileName1.endsWith(".txt")) return "text/plain";
    else if (strFileName1.endsWith(".xml")) return "text/xml";
    else if (strFileName1.endsWith(".css")) return "text/css";
    else if (strFileName1.endsWith(".js"))  return "application/javascript";
    else if (strFileName1.endsWith(".zip")) return "application/zip";
    else if (strFileName1.endsWith(".swf")) return "application/x-shockwave-flash";
    else if (strFileName1.endsWith(".gif")) return "image/gif";
    else if (strFileName1.endsWith(".jpg")) return "image/jpeg";
    else if (strFileName1.endsWith(".png")) return "image/png";

    return NULL;
}

QString HttpSocket::getParameter(const QStringList & lstParameters, const QString & strKey)
{
    if (!lstParameters.isEmpty()){
        for (int n=0 ; n<lstParameters.count() ; n++) {
            if (lstParameters[n].startsWith(strKey+"=")) {
                QString str = lstParameters[n].mid(strKey.length()+1).replace('+', "%20");
                return QUrl::fromPercentEncoding(str.toUtf8());
            }

        }
    }

    return NULL;
}
