# h5control
h5control service enables your web-based apps using javascript to control Arduino or other IoT hardware.


## h5control service

h5connect is a service executable for Windows, MacOS and Linux. The source project can be recompiled with Qt 5 libraries. The service sets up a bridge for the intercommunications between a USB-connected Arduino hardware and a html5-based app runs h5control.js javascript .   


## h5control js

The html code of your user web app must include a javascript file named h5control.js that provides the necessary drive to configure and control Arduino IO in your javascript program.

For detailed introduction of the concept and a complete tutorial, please see example html files.


## h5control device

In order to make sure your Arduino working properly with h5control, a sketch named rioc-arduino must be downloaded to your Arduino board.  See also https://github.com/robinz-labs/rioc-arduino
