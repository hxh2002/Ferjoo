# Classic PNG assets

The application uses the four PNG files from Ferjoo commit:

`0a8d43b1805553bd6783651243afe4a3451168de`

Required filenames:

- `bg2.png`
- `logo-brand.png`
- `logo-df-cn.png`
- `logo-df-en.png`

`npm install` runs `scripts/fetch-classic-assets.mjs`, which downloads these exact files from that pinned commit into this directory before the Vite build.
