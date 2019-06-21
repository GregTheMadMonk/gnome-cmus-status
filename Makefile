install:
	cp -R cmus.status@yagreg7.gmail.com ~/.local/share/gnome-shell/extensions/
	-gnome-shell-extension-tool -e cmus.status@yagreg7.gmail.com
zip:
	zip -rj gnome-cmus-status.zip cmus.status@yagreg7.gmail.com -x *.sw* -x *old-extension.js
