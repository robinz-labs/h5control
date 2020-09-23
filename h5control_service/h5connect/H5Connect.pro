QT += core serialport websockets widgets

TARGET = h5connect

!macx {
    CONFIG += console
    CONFIG -= app_bundle
}

TEMPLATE = app

SOURCES += \
    main.cpp \
    h5connect.cpp \
    com_handler.cpp \
    rioc_service.cpp \
    http_socket.cpp \
    http_server.cpp \
    http_request_handler.cpp \
    h5connect_gui.cpp \
    h5connect_settings_form.cpp

HEADERS  += \
    h5connect.h \
    com_handler.h \
    rioc_service.h \
    http_server.h \
    http_socket.h \
    http_request_handler.h \
    h5connect_gui.h \
    h5connect_settings_form.h


install_extra.path = $$OUT_PWD
install_extra.files += $$PWD/settings.json

INSTALLS += install_extra

RESOURCES += \
    h5connect.qrc

FORMS += \
    h5connect_settings_form.ui
