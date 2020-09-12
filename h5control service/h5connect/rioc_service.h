#ifndef RIOCSERVICE_H
#define RIOCSERVICE_H

#include <QObject>
#include <QTimer>

class ComHandler;

class RiocService : public QObject
{
    Q_OBJECT
public:
    explicit RiocService(QObject *parent = 0);
    ~RiocService();

    void setLoggerEnabled(bool enable) { _isLoggerEnanbled = enable; }
    void setMessagingInterval(int milliseconds);

    bool addSerialConnection(const QString & serialPort, int serialBaud = 9600);
    void clearSerialConnections();
    int getSerialCount();

    void sendRiocMessage(unsigned char fromID, unsigned char toID, const QByteArray & data, bool instantly = false);
    bool sendRiocMessageAndWaitResponse(unsigned char fromID, unsigned char toID,
                                        const QByteArray & dataOut, QByteArray & dataIn,
                                        double timeout = 1.5);

signals:
    void riocMessageReceived(unsigned char fromID, unsigned char toID, const QByteArray & data);

private slots:
    void handleOutgoingMessageTimerFired();
    void handleSerialBytesReceived(ComHandler* serial);

private:
    bool _isLoggerEnanbled;
    QList<ComHandler*> _serials;

    // for sending message traffic control
    QTimer _outgoingMessageTimer;
    QList<QByteArray> _outgoingMessageQueue;

    // for receiving specific message
    bool _isSpecificIncomingMessageReceived;
    unsigned char _specificIncomingMessageFromID;
    QByteArray _specificIncomingMessageFilter;
    QByteArray _specificIncomingMessageReceived;

    void sendSerialMessage(const QByteArray & message);

    unsigned char checksum(unsigned char *bytes, int length);
    double getCurrentSecond();
};

#endif // RIOCSERVICE_H
