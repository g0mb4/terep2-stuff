# Terep2MapViewer

Utility that can visualize Terep2 maps in a browser.
It is planned to be used on https://terep2.wiki.gg/wiki/Index_of_maps.

## Local usage

Start local webserver:
```bash
python -m http.server
```

Use the URL to select the map, e.g.:

```
http://127.0.0.1:8000/?mapName=Original&creator=Dénes%20Nagymáthé&date=1996-05-04&mapFile=maps/ORIGINAL/MAP.PCX&colFile=maps/ORIGINAL/COL.PCX&maptexFile=maps/ORIGINAL/MAPTEX.PCX
```

or

```
http://127.0.0.1:8000/?mapName=Original&creator=Dénes%20Nagymáthé&date=1996-05-04&map=ORIGINAL
```

The `creator` parameter can be omitted.
