#include <sys/time.h>
#include <QSerialPort>
#include <QSerialPortInfo>
#include <QThread>
#include "com_handler.h"

//#define CH_LOG_ENABLED
#define CH_BUFFER_REC_SIZE 0x100000 // 1MBytes

ComHandler::ComHandler(QObject *parent) :
    QObject(parent)
{
    // init vars
    _serial = new QSerialPort();
    _connected = false;
    _isAsyncReceiver = true;

    // create buffer for receiving bytes
    _bufferReceived = (char*)malloc(CH_BUFFER_REC_SIZE + 1);
    _lboundReceived = 0;
    _uboundReceived = 0;
}

ComHandler::~ComHandler()
{
    // force to close port
    close();
    delete _serial;

    // delete buffer for receiving bytes
    free(_bufferReceived);
}

bool ComHandler::open(const char* port, int baud, int setting)
{
    // if connection already exists
    if (_connected) {
        this->close();
        if (_connected) return false;
    }

    // connect to serial
    _serial->setPortName(port);
    _connected = _serial->open(QIODevice::ReadWrite);

    if (_connected) {

        // serial port settings
        _serial->setBaudRate(baud);
        _serial->setFlowControl(QSerialPort::NoFlowControl);
        switch (setting) {
        case CH_SETTING_8N1:
            _serial->setDataBits(QSerialPort::Data8);
            _serial->setParity(QSerialPort::NoParity);
            _serial->setStopBits(QSerialPort::OneStop);
            break;
        case CH_SETTING_8E1:
            _serial->setDataBits(QSerialPort::Data8);
            _serial->setParity(QSerialPort::EvenParity);
            _serial->setStopBits(QSerialPort::OneStop);
            break;
        case CH_SETTING_8O1:
            _serial->setDataBits(QSerialPort::Data8);
            _serial->setParity(QSerialPort::OddParity);
            _serial->setStopBits(QSerialPort::OneStop);
            break;
        case CH_SETTING_7E1:
            _serial->setDataBits(QSerialPort::Data7);
            _serial->setParity(QSerialPort::EvenParity);
            _serial->setStopBits(QSerialPort::OneStop);
            break;
        case CH_SETTING_7O1:
            _serial->setDataBits(QSerialPort::Data7);
            _serial->setParity(QSerialPort::OddParity);
            _serial->setStopBits(QSerialPort::OneStop);
            break;
        }

        // clear buffer for receiving incoming bytes
        _lboundReceived = 0;
        _uboundReceived = 0;

        if (_isAsyncReceiver) {
            connect(_serial, SIGNAL(readyRead()), this, SLOT(readData()));
        }

        return true;
    }

    return false;
}

void ComHandler::close()
{
    _serial->close();
    _connected = false;

    return;
}

void ComHandler::setAsyncReceiver(bool isAsync)
{
    if (_connected &&
        _isAsyncReceiver != isAsync) {

        if (isAsync) {
            connect(_serial, SIGNAL(readyRead()), this, SLOT(readData()));
        } else {
            disconnect(_serial, SIGNAL(readyRead()), 0, 0);
        }
    }

    _isAsyncReceiver = isAsync;
}


bool ComHandler::sendBytes(const char* buffer, int length)
{
    if (_connected) {

        #ifdef CH_LOG_ENABLED
        qDebug("SND: %s", QByteArray(buffer, length).toHex().constData());
        #endif

        if (_serial->write(buffer, length) != -1) {
            _serial->waitForBytesWritten(5); // _serial->flush();
            //QThread::msleep(20);
            return true;
        }
    }
    return false;
}

int ComHandler::numberOfReceivedBytes()
{
    return _uboundReceived - _lboundReceived;
}

char* ComHandler::receivedBytes()
{
    return _bufferReceived + _lboundReceived;
}

int ComHandler::getReceivedBytes(char* buffer, int length)
{
    int len = numberOfReceivedBytes();
    if (len > 0) {
        if (length < len) len = length;
        memcpy(buffer, receivedBytes(), len);
        _lboundReceived += len;

        if (_lboundReceived == _uboundReceived) {
            _lboundReceived = 0;
            _uboundReceived = 0;
        }

        return len;
    }
    return 0;
}

int ComHandler::getReceivedDataFrame(char* buffer, int length, char leading, char ending)
{
    int lenReceived = numberOfReceivedBytes();
    char* bufReceived = receivedBytes();

    // find the first data frame in the received bytes
    int n;
    int posDataFrameBegin = -1;
    for (n=0 ; n<lenReceived-1 ; n++) {
        if (bufReceived[n]==leading) {
            posDataFrameBegin = n;
            break;
        }
    }

    int posDataFrameEnd = -1;
    if (posDataFrameBegin>=0) {
        for (n=posDataFrameBegin+1 ; n<lenReceived ; n++) {
            if (bufReceived[n]==ending) {
                posDataFrameEnd = n;
                break;
            }
        }
    }

    // obtain data frame from the received bytes
    // the obtained data frame contains leading and ending charaters
    if (posDataFrameBegin>=0 && posDataFrameEnd > posDataFrameBegin) {

        int lenDataFrame = posDataFrameEnd - posDataFrameBegin + 1;
        int len = lenDataFrame;

        if (length < len) len = length;
        memcpy(buffer, receivedBytes()+posDataFrameBegin, len);
        _lboundReceived += posDataFrameEnd+1;

        if (_lboundReceived == _uboundReceived) {
            _lboundReceived = 0;
            _uboundReceived = 0;
        }

        return len;

    }

    return 0;

}

int ComHandler::getReceivedDataFrame(char* buffer, int length, const char* leading, const char* ending)
{
    int lenReceived = numberOfReceivedBytes();
    char* bufReceived = receivedBytes();

    int lenLeading = 0;
    if (leading!=NULL) lenLeading = strlen(leading);

    int lenEnding = 0;
    if (ending!=NULL) lenEnding = strlen(ending);

    if (lenReceived < lenLeading+lenEnding) return 0;

    // find the first data frame in the received bytes
    int n, m;

    int posDataFrameBegin = -1;
    if (lenLeading==0) {
        posDataFrameBegin = 0;
    } else {
        for (n=0 ; n<lenReceived-lenLeading-lenEnding+1 ; n++) {
            for (m=0 ; m<lenLeading ; m++) {
                if (bufReceived[n+m]!=leading[m]) break;
            }
            if (m==lenLeading) {
                posDataFrameBegin = n;
                break;
            }
        }
    }

    int posDataFrameEnd = -1;
    if (posDataFrameBegin>=0) {
        if (lenEnding==0) {
            posDataFrameEnd = lenReceived-1;
        } else {
            for (n=posDataFrameBegin+lenLeading ; n<lenReceived-lenEnding+1 ; n++) {
                for (m=0 ; m<lenEnding ; m++) {
                    if (bufReceived[n+m]!=ending[m]) break;
                }
                if (m==lenEnding) {
                    posDataFrameEnd = n+m-1;
                    break;
                }
            }
        }
    }

    // obtain data frame from the received bytes
    // the obtained data frame contains leading and ending charaters
    if (posDataFrameBegin>=0 && posDataFrameEnd > posDataFrameBegin) {

        int lenDataFrame = posDataFrameEnd - posDataFrameBegin + 1;
        int len = lenDataFrame;

        if (length < len) len = length;
        memcpy(buffer, receivedBytes()+posDataFrameBegin, len);
        _lboundReceived += posDataFrameEnd+1;

        if (_lboundReceived == _uboundReceived) {
            _lboundReceived = 0;
            _uboundReceived = 0;
        }

        return len;

    }

    return 0;

}

int ComHandler::getReceivedFixedLengthFrame(char* buffer, int length, char leading, char ending)
{
    int lenReceived = numberOfReceivedBytes();
    char* bufReceived = receivedBytes();

    // find the first data frame in the received bytes
    int n;
    int posDataFrameBegin = -1;
    int posDataFrameEnd = -1;
    for (n=0 ; n<=lenReceived-length ; n++) {
        if (bufReceived[n]==leading && bufReceived[n+length-1]==ending) {
            posDataFrameBegin = n;
            posDataFrameEnd = n+length-1;
            break;
        }
    }

    // obtain data frame from the received bytes
    if (posDataFrameBegin>=0) {

        memcpy(buffer, receivedBytes()+posDataFrameBegin, length);
        _lboundReceived += posDataFrameEnd+1;

        if (_lboundReceived == _uboundReceived) {
            _lboundReceived = 0;
            _uboundReceived = 0;
        }

        return length;
    }

    return 0;
}

int ComHandler::sendAndReceiveBytes(const char* bufSend, int lenBufSend,
                                      char* bufReceive, int lenBufReceive,
                                      const char* szEnding, double timeout,
                                      int* err)
{
  if (!_connected) return -1;

  #ifdef CH_LOG_ENABLED
  qDebug("SND: %s", QByteArray(bufSend, lenBufSend).toHex().constData());
  #endif

  // drop incoming bytes before sending command
  int len;
  while(true) {
      len = _serial->read(bufReceive, lenBufReceive);
      if (len<=0) break;
  }

  // send command bytes
  if (_serial->write(bufSend, lenBufSend) == -1) {
      if (err!=NULL) *err=COM_ERR_SEND_FAILED;
      return -1;
  }
  _serial->waitForBytesWritten(5); // _serial->flush();

  // receive response bytes
  int lenReceived = 0;
  double begin = getCurrentSecond();

  int n;

  bool isEnd;
  int lenEnding = 0;
  if (szEnding!=NULL) lenEnding = strlen(szEnding);

  while(true) {
      _serial->waitForReadyRead(50);

      len = _serial->read(bufReceive+lenReceived, lenBufReceive-lenReceived);
      if (len>0) {

          #ifdef CH_LOG_ENABLED
          qDebug("REC: %s", QByteArray(bufReceive+lenReceived, len).toHex().constData());
          #endif

          lenReceived += len;
      }

      // ending characters checking
      if (lenEnding>0 &&
          lenReceived >= lenEnding) {

          isEnd = true;
          for (n=0;n<lenEnding;n++) {
              if (bufReceive[lenReceived-lenEnding+n] != szEnding[n]) {
                  isEnd = false;
                  break;
              }
          }
          if (isEnd) break;
      }

      // timeout checking
      double now = getCurrentSecond();
      if (now-begin>timeout) {
          if (err!=NULL) *err=COM_ERR_RECEIVE_TIMEOUT;
          break;
      }

      // buffer is full
      if (lenBufReceive == lenReceived) {
          if (err!=NULL) *err=COM_ERR_RECEIVE_BUFFULL;
          break;
      }
  }

  return lenReceived;
}

void ComHandler::checkReceivedBytes()
{
    _serial->waitForReadyRead(50);
    readData();
}

void ComHandler::readData()
{
    if (!_connected) return;

    // calculate unused buffer to receive incoming bytes
    ssize_t unusedBufferSize = CH_BUFFER_REC_SIZE - _uboundReceived;
    if (unusedBufferSize <= 0) {
        if (_uboundReceived - _lboundReceived > 0 &&
            _lboundReceived != 0) {

            // no enough space, then move received bytes in the buffer to obtain more free space
            // before: ........XXX
            // after:  XXX........

            int lenReceived = _uboundReceived - _lboundReceived;
            memcpy(_bufferReceived, _bufferReceived + _lboundReceived, lenReceived);
            _lboundReceived = 0;
            _uboundReceived = lenReceived;
            unusedBufferSize = CH_BUFFER_REC_SIZE - _uboundReceived;

        } else {

            // buffer is full, then have to empty all (unexceptional)
            // before: XXXXXXXXXXX
            // after:  ...........

            _lboundReceived = 0;
            _uboundReceived = 0;
            unusedBufferSize = CH_BUFFER_REC_SIZE;
        }
    }

    // read bytes from device
    ssize_t len = _serial->read(_bufferReceived + _uboundReceived, unusedBufferSize);
    //qDebug("unused = %d, len = %d", unusedBufferSize, (int)len);

    if (len>0) {

        #ifdef CH_LOG_ENABLED
        qDebug("REC: %s", QByteArray(_bufferReceived + _uboundReceived, len).toHex().constData());
        #endif

        _uboundReceived += len;
        _bufferReceived[_uboundReceived]=0; // make the buffer as a zero-terminated string

        //qDebug("received length = %d (%d ~ %d)", numberOfReceivedBytes(), _lboundReceived, _uboundReceived);
        //qDebug("received length = %d (%d ~ %d) %s", numberOfReceivedBytes(), _lboundReceived, _uboundReceived, _bufferReceived + _uboundReceived - len);

        emit bytesReceived(this);
    }
}

double ComHandler::getCurrentSecond()
{
    struct timeval tv;
    gettimeofday(&tv, NULL);
    return (double)(tv.tv_sec) + (double)(tv.tv_usec)*0.000001;
}

QString ComHandler::findPort(uint32_t vid, uint32_t pid, const char* description, const char* manufacturer)
{
    bool found = false;
    foreach (const QSerialPortInfo &serialPortInfo, QSerialPortInfo::availablePorts()) {

        if (vid!=0 && pid!=0 &&
            serialPortInfo.hasVendorIdentifier() && serialPortInfo.hasProductIdentifier() &&
            serialPortInfo.vendorIdentifier()==vid && serialPortInfo.productIdentifier()==pid) {
            found = true;
        }

        if (vid!=0 && pid==0 &&
            serialPortInfo.hasVendorIdentifier() &&
            serialPortInfo.vendorIdentifier()==vid) {
            found = true;
        }

        if (description != NULL && description[0]!=0 &&
            serialPortInfo.description().contains(QString(description))) {
            found = true;
        }

        if (manufacturer != NULL && manufacturer[0]!=0 &&
            serialPortInfo.manufacturer().contains(QString(manufacturer))) {
            found = true;
        }

        if (found) return serialPortInfo.portName();
    }

    return "";
}
