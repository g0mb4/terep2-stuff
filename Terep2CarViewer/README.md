# Terep2CarViewer

Utility that can visualize Terep2 cars in a browser.
It is planned to be used on https://terep2.wiki.gg/wiki/Index_of_car_skins and https://terep2.wiki.gg/wiki/Index_of_car_models.

> [!WARNING]
> The project is in development.

## Local usage

Start local webserver:
```bash
python -m http.server
```

Use the URL:

```
http://127.0.0.1:8000/index.html?datFile=cars/models/CAR1.DAT&pcxFile=cars/skins/TEXTURES.PCX&palFile=cars/palette/ORIGINAL.PCX
```

If `pcxFile` is omitted it is *cars/skins/TEXTURES.PCX*.
If `palFile` is omitted it is *cars/palette/ORIGINAL.PCX*.
