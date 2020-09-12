#ifndef H5CONNECTGUI_H
#define H5CONNECTGUI_H

#include <QObject>
#include <QSystemTrayIcon>
#include <QMenu>
#include <QAction>

class H5ConnectGUI : public QObject
{
    Q_OBJECT
public:
    explicit H5ConnectGUI(QObject *parent = 0);
    ~H5ConnectGUI();

signals:

public slots:

    void iconActivated(QSystemTrayIcon::ActivationReason reason);

    void showAbout();
    void showManager();
    void showSettings();
    void restart();
    void stop();

private:
    QSystemTrayIcon* _trayIcon;
    QMenu* _menu;
    QAction* _actionShowAbout;
    QAction* _actionShowManager;
    QAction* _actionShowSettings;
    QAction* _actionRestart;
    QAction* _actionStop;

    void showStatusMessage();
};

#endif // H5CONNECTGUI_H
