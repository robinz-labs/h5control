#ifndef HTTP_SOCKET_H
#define HTTP_SOCKET_H

#include <QTcpSocket>

class HttpSocket : public QTcpSocket
{
    Q_OBJECT
public:
    explicit HttpSocket(QObject *parent = 0);
    ~HttpSocket();

    void setLoggerEnabled(bool enable) { _isLoggerEnanbled = enable; }

    static QString getFileType(const QString & strFileName);
    static QString getParameter(const QStringList & lstParameters, const QString & strKey);

signals:
    void httpRequestReceived(
            const QString & contentPath,
            const QStringList & parameters,
            QString & response);

public slots:
    void readClient();

private:
    bool _isLoggerEnanbled;

    char* _bufRequest;
    int   _lenBufRequest;

    void processHttpRequest();
    void transferFile(QDataStream & out, const QString & strFilePath, const QString & strFileType);
    void outputHttpHead(QDataStream & out, const QString & strFileType =  NULL);
    void outputSystemInfo(QDataStream & out);
};

#endif // SL_HTTP_SOCKET_H
