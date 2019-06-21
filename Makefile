install:
	#-mkdir ~/.local/share/gnome-sheel/extensions/
	cp -R cmus.status@yagreg7.gmail.com ~/.local/share/gnome-shell/extensions/
	-gnome-shell-extension-tool -e cmus.status@yagreg7.gmail.com
