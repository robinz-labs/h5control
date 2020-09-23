#ifndef HTTPREQUESTHANDLER_H
#define HTTPREQUESTHANDLER_H

#include <QObject>

class H5Connect;

class HttpRequestHandler : public QObject
{
    Q_OBJECT
public:
    explicit HttpRequestHandler(QObject *parent = 0);
    QString processHttpRequest(const QString & contentPath, const QStringList & parameters);

signals:

public slots:

private:

    H5Connect* _h5connect;

    QString gotoDefaultPage(const QString & url);
    QString restartSystem();

    QString getSystemInfo();
    QString listSerialPorts();
    QString readAllSettings();
    QString writeSetting(const QString & group, const QString & key, const QJsonValue & val);
    QString saveAllSettings();
};

#endif // HTTPREQUESTHANDLER_H
