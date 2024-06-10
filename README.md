# Spotify Album Shuffler
This is part of the album shuffler project. This repository is used to create the required Elm code for the actual [web app](https://github.com/AlbumShuffler/Frontend). It takes an input file like the following:
```
[ { "shortName": "Short 1"
  , "httpFriendlyShortName": "short1"
  , "type": "artist"
  , "id": "abcdefghijklmnopqrstuvwxyz"
  , "icon": "img/short_1.pgn"
  , "coverCenterX": 50
  , "coverCenterY": 50
  , "coverColorA": "#FF0000"
  , "coverColorB": "#0000FF" }
, { "shortName": "Short 2"
  , "httpFriendlyShortName": "short2"
  , "type": "artist"
  , "id": "zyxwvutsrqponmlkjihgfedcba"
  , "icon": "img/short_2.png"
  , "coverCenterX": 50
  , "coverCenterY": 50
  , "coverColorA": "#990000"
  , "coverColorB": "#000099" }
]
```
and turns it into multiple (three, in this case) Elm files.

Additional data from Spotify is required. I have a set of bash scripts that authenticate with the Spotify web api and download everything. However, they are not public yet. I am working on that :)

## Usage
**This project currently has hardocded data pointing to a private GitHub repository. If you want to use it you need to change the urls yourself or wait for me to make everything configurable :)**

Clone the repository, install all dependencies and run the script:
```
git clone https://github.com/AlbumShuffler/Generator.git shuffler-generator
cd shuffler-generator
npm i
node index.js --token=GITHUB_REPO_ACCESS_TOKEN
cp output/*.elm /path/to/my/elm/app/src
```
