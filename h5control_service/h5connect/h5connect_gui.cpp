#include <QApplication>
#include <QMessageBox>
#include <QDesktopServices>
#include <QUrl>

#include "h5connect_gui.h"
#include "h5connect_settings_form.h"
#include "h5connect.h"

H5ConnectGUI::H5ConnectGUI(QObject *parent) : QObject(parent)
{
    _actionShowAbout   = new QAction(tr("About..."), this);
    _actionShowManager = new QAction(tr("h5control Manager..."), this);
    _actionShowSettings= new QAction(tr("h5control Settings..."), this);
    _actionRestart     = new QAction(tr("Restart h5control Service..."), this);
    _actionStop        = new QAction(tr("Stop h5control Service..."), this);

    connect(_actionShowAbout,   SIGNAL(triggered()), this, SLOT(showAbout()));
    connect(_actionShowManager, SIGNAL(triggered()), this, SLOT(showManager()));
    connect(_actionShowSettings,SIGNAL(triggered()), this, SLOT(showSettings()));
    connect(_actionRestart,     SIGNAL(triggered()), this, SLOT(restart()));
    connect(_actionStop,        SIGNAL(triggered()), this, SLOT(stop()));

    _menu = new QMenu();
    _menu->addAction(_actionShowAbout);
    _menu->addAction(_actionShowManager);
    _menu->addAction(_actionShowSettings);
    _menu->addSeparator();
    _menu->addAction(_actionRestart);
    _menu->addAction(_actionStop);

    _trayIcon = new QSystemTrayIcon(this);
    _trayIcon->setIcon(QIcon(":/logo.png"));
    _trayIcon->setToolTip("h5control service");
    _trayIcon->setContextMenu(_menu);
    _trayIcon->show();

    connect(_trayIcon, SIGNAL(activated(QSystemTrayIcon::ActivationReason)),
            this, SLOT(iconActivated(QSystemTrayIcon::ActivationReason)));

    QApplication::setQuitOnLastWindowClosed(false);

    showStatusMessage();
}

H5ConnectGUI::~H5ConnectGUI()
{
    delete _trayIcon;
    delete _menu;
    delete _actionShowManager;
    delete _actionShowSettings;
    delete _actionRestart;
    delete _actionStop;
}

void H5ConnectGUI::iconActivated(QSystemTrayIcon::ActivationReason reason)
{
    if (reason == QSystemTrayIcon::Trigger) {

#ifdef Q_OS_WIN
        bool isReady = (g_h5connect->websocketIsReady() && g_h5connect->httpIsReady());
        QString title = (isReady ? tr("h5control Service Ready") : tr("h5control Service Error"));
        QString msg = (isReady ? tr("h5control service is running properly.") : tr("h5control service is not running properly."));
        msg += tr(" Please right click the icon for more options.");
        _trayIcon->showMessage(title, msg);
#endif
    }
}

void H5ConnectGUI::showStatusMessage()
{
    if (g_h5connect->websocketIsReady() && g_h5connect->httpIsReady()) {
        _trayIcon->showMessage(tr("h5control Service Ready"),
                               tr("h5control service is running properly."));
    } else {
        _trayIcon->showMessage(tr("h5control Service Error"),
                               tr("h5control service is not running properly, please confirm the service port settings are correct."));
    }
}

void H5ConnectGUI::showAbout()
{
    QJsonObject & settings = g_h5connect->settings();
    int httpPort = settings["service"].toObject()["http-port"].toInt();
    int websocketPort = settings["service"].toObject()["websocket-port"].toInt();

    QMessageBox msgbox;
    msgbox.setWindowTitle(tr("About"));
    msgbox.setText(QString(tr("\r\nh5control Service\r\nVersion %1\r\n"))
                   .arg(H5CONNECT_VERSION));
    msgbox.setInformativeText(QString(tr("HTTP Service: %1\r\nHTTP Port: %2\r\n\r\nWeb Socket Service: %3\r\nWeb Socket Port: %4\r\n\r\nh5control.com\r\n[c] 2016 Robin Zhang\r\n"))
                   .arg(g_h5connect->httpIsReady() ? "Ready" : "Error")
                   .arg(httpPort)
                   .arg(g_h5connect->websocketIsReady() ? "Ready" : "Error")
                   .arg(websocketPort));
    QPixmap icon;
    if(icon.load("://logo.png")) {
        icon.setDevicePixelRatio(2.0);
        msgbox.setIconPixmap(icon);
    }
    msgbox.addButton(QMessageBox::Ok);
    QPushButton *buttonQt = msgbox.addButton(tr("About Qt..."), QMessageBox::ActionRole);

    msgbox.exec();
    if (msgbox.clickedButton() == (QAbstractButton*)buttonQt) {
        QMessageBox::aboutQt(NULL, NULL);
    }
}

void H5ConnectGUI::showManager()
{
    QJsonObject & settings = g_h5connect->settings();
    int httpPort = settings["service"].toObject()["http-port"].toInt();

    QDesktopServices::openUrl(QUrl(QString("http://127.0.0.1:%1").arg(httpPort)));
}

void H5ConnectGUI::showSettings()
{
    QJsonObject & settings = g_h5connect->settings();
    QJsonObject serviceInfo = settings["service"].toObject();
    int websocketPort = serviceInfo["websocket-port"].toInt();
    int httpPort = serviceInfo["http-port"].toInt();
    int messagingInterval = settings["messaging-interval"].toInt();

    H5ConnectSettingsForm settingsForm;
    settingsForm.setFields(websocketPort, httpPort, messagingInterval);
    if (settingsForm.exec() == QDialog::Accepted) {
        settingsForm.getFields(&websocketPort, &httpPort, &messagingInterval);

        serviceInfo["websocket-port"] = websocketPort;
        serviceInfo["http-port"] = httpPort;
        settings["service"] = serviceInfo;
        settings["messaging-interval"] = messagingInterval;

        g_h5connect->saveSettings();
        restart();
    }
}

void H5ConnectGUI::restart()
{
    if (QMessageBox::warning(
                NULL,
                tr("h5control"),
                tr("Are you sure you want to restart the h5control service now?"),
                QMessageBox::Yes|QMessageBox::No,
                QMessageBox::Yes) == QMessageBox::Yes) {

        g_h5connect->restart();
        showStatusMessage();
    }
}

void H5ConnectGUI::stop()
{
    if (QMessageBox::warning(
                NULL,
                tr("h5control"),
                tr("Are you sure you want to stop the h5control service?"),
                QMessageBox::Yes|QMessageBox::No,
                QMessageBox::Yes) == QMessageBox::Yes) {
        QApplication::quit();
    }
}
