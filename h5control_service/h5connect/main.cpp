#include <QApplication>
#include "h5connect.h"
#include "h5connect_gui.h"

int main(int argc, char *argv[])
{

#ifdef Q_OS_LINUX
    bool isGUI = false;
#else
    bool isGUI = true;
#endif

    // parse parameters
    for (int i = 1; i < argc; ++i) {
        if (!qstrcmp(argv[i], "-no-gui")) {
            isGUI = false;
        } else if (!qstrcmp(argv[i], "-gui")) {
            isGUI = true;
        }
    }

    // init app (command line or gui alternative)
    QCoreApplication *appCore = NULL;
    QApplication *appGUI = NULL;
    if (isGUI)
        appGUI = new QApplication(argc, argv);
    else
        appCore = new QCoreApplication(argc, argv);

    // int h5connect core
    g_h5connect = new H5Connect();

    // event loop
    int r = 0;
    if (isGUI) {
        // gui app
        H5ConnectGUI *gui = new H5ConnectGUI();
        r = appGUI->exec();
        delete appGUI;
        delete gui;
    } else {
        // command line app
        r = appCore->exec();
        delete appCore;
    }

    delete g_h5connect;
    return r;
}

