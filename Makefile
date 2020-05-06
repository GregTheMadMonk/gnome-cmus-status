install: remove
	glib-compile-schemas cmus-status@yagreg7.gmail.com/schemas/
	cp -R cmus-status@yagreg7.gmail.com ~/.local/share/gnome-shell/extensions/
	-gnome-extensions enable cmus.status@yagreg7.gmail.com
zip:
	glib-compile-schemas cmus-status@yagreg7.gmail.com/schemas
	cd cmus-status@yagreg7.gmail.com && zip -r gnome-cmus-status.zip ./ -x *.sw* -x *old-extension.js -x *~

remove:
	-rm -rf ~/.local/share/gnome-shell/extensions/cmus-status@yagreg7.gmail.com
	-sudo rm /usr/share/glib-2.0/schemas/org.gnome.shell.extensions.cmus-status.gschema.xml
	sudo glib-compile-schemas /usr/share/glib-2.0/schemas/
