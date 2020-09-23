#include "h5connect_settings_form.h"
#include "ui_h5connect_settings_form.h"

H5ConnectSettingsForm::H5ConnectSettingsForm(QWidget *parent) :
    QDialog(parent),
    ui(new Ui::H5ConnectSettingsForm)
{
    ui->setupUi(this);

    connect(ui->buttonBox, SIGNAL(accepted()), this, SLOT(accept()));
    connect(ui->buttonBox, SIGNAL(rejected()), this, SLOT(reject()));
    connect(ui->buttonBox, SIGNAL(clicked(QAbstractButton*)), this, SLOT(handleButtonClicked(QAbstractButton*)));
}

H5ConnectSettingsForm::~H5ConnectSettingsForm()
{
    delete ui;
}

void H5ConnectSettingsForm::setFields(int websocketPort, int httpPort, int messagingInterval)
{
    ui->spinWebsocketPort->setValue(websocketPort);
    ui->spinHttpPort->setValue(httpPort);
    ui->spinMessagingInterval->setValue(messagingInterval);
}

void H5ConnectSettingsForm::getFields(int* pWebsocketPort, int* pHttpPort, int* pMessagingInterval)
{
    *pWebsocketPort = ui->spinWebsocketPort->value();
    *pHttpPort = ui->spinHttpPort->value();
    *pMessagingInterval = ui->spinMessagingInterval->value();
}

void H5ConnectSettingsForm::handleButtonClicked(QAbstractButton* button)
{
    if (button == ui->buttonBox->buttons()[2]) {
        // restore defaults
        ui->spinWebsocketPort->setValue(50000);
        ui->spinHttpPort->setValue(58000);
        ui->spinMessagingInterval->setValue(0);
    }
}
