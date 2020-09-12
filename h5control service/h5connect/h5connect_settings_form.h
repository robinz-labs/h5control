#ifndef H5CONNECT_SETTINGS_FORM_H
#define H5CONNECT_SETTINGS_FORM_H

#include <QDialog>
#include <QAbstractButton>

namespace Ui {
class H5ConnectSettingsForm;
}

class H5ConnectSettingsForm : public QDialog
{
    Q_OBJECT

public:
    explicit H5ConnectSettingsForm(QWidget *parent = 0);
    ~H5ConnectSettingsForm();

    void setFields(int websocketPort, int httpPort, int messagingInterval);
    void getFields(int* pWebsocketPort, int* pHttpPort, int* pMessagingInterval);

private slots:
    void handleButtonClicked(QAbstractButton* button);

private:
    Ui::H5ConnectSettingsForm *ui;
};

#endif // H5CONNECT_SETTINGS_FORM_H
