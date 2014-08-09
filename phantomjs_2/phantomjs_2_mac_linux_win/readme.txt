Running Dependancies

For linux(ubuntu) you may need to install the following packages to run it
sudo apt-get install libicu48

sudo apt-get install ttf-mscorefonts-installer fontconfig libfreetype6 libfontconfig1





-= How To Build The Source For Mac=-
Build ICU
curl http://download.icu-project.org/files/icu4c/4.8.1.1/icu4c-4_8_1_1-src.tgz -O
tar -xvf icu4c-4_8_1_1-src.tgz
cd icu/source
./runConfigureICU MacOSX
make 
sudo make install 

then for for Phantomjs
git clone https://github.com/KDAB/phantomjs.git
cd phantomjs
git submodule init
git submodule update
sh build.sh --confirm --jobs 10 --qt-config "-I/usr/local/include/ -L /usr/local/lib/"




-=How To Build The Source For Linux=-

# Download PhantomJS

git clone https://github.com/KDAB/phantomjs.git
cd phantomjs
git submodule init
git submodule update


# Update PhantomJS
git pull
git submodule update


# Build/Install ICU
curl http://download.icu-project.org/files/icu4c/4.8.1.1/icu4c-4_8_1_1-src.tgz -O

tar -xvf icu4c-4_8_1_1-src.tgz
cd icu/source
./configure
make
sudo make install


# Install Dependencies (Linux Mint (Ubuntu))
sudo apt-get install sqlite3 libsqlite3-dev ruby gperf bison flex


# Build PhantomJS
./build.sh --confirm --jobs 10



-= How To Build The Source For Windows=-
git clone https://github.com/Vitallium/phantomjs-qt5
cd phantomjs-qt5
git submodule init
git submodule update
cd src/qt
git clone https://github.com/Vitallium/phantomjs-3rdparty-win
rename phantomjs-3rdparty-win 3rdparty
notepad.exe preconfig.cmd

then change !BUILD_TYPE! to release sand save it

cd ../../
env.cmd
cd src/qt
preconfig.cmd
cd qtbase
nmake
cd ../qtwebkit
..\qtbase\bin\qmake && nmake
cd ..\..
qt\qtbase\bin\qmake && nmake


Much thanks to Vitaliy for the help with the windows build, he walked me through it!