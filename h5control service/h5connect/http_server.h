#ifndef HTTP_SERVER_H
#define HTTP_SERVER_H

#include <QTcpServer>

class HttpServer : public QTcpServer
{
    Q_OBJECT
public:
    explicit HttpServer(QObject *parent = 0);

    void setLoggerEnabled(bool enable) { _isLoggerEnanbled = enable; }

    void setFilesPath(QString path);
    QString filesPath();

signals:
    void httpRequestReceived(
            const QString & contentPath,
            const QStringList & parameters,
            QString & response);

public slots:
    void handleHttpRequestReceived(
            const QString & contentPath,
            const QStringList & parameters,
            QString & response);

private:
    bool _isLoggerEnanbled;
    QString _strFilesPath;

    void incomingConnection(qintptr socketId);

};

#endif // HTTP_SERVER_H
