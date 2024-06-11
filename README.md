# Spotify Album Shuffler
This is part of the album shuffler project. This repository is used to create the required Elm code for the actual [web app](https://github.com/AlbumShuffler/Frontend).

## Configuration
The generator requires several input files to generate Elm code.

### Source file
First, you need to define the "source". It is a JSON file in the following form:
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
It defines the artists that will later show up in the web app. All fields except the `id` and `type` field may be chosen as you see fit. The `type` field needs to either be set to `artist` or `playlist`. The `id` fields needs to contain the `id` of the artist or playlist that is used by Spotify for identification. The easiest way is to use the Spotify web interface and grab the ids from the current url.

### Spotify metadata
Additional data from Spotify is required. There is a set of bash scripts that authenticate with the Spotify web api and download everything. See [this repository](https://github.com/AlbumShuffler/DataRetriever) for details. The scripts use **the same source file** as this generator. Its output will be several folders each with two files in them:

1. `artist` - contains artist/playlist details
2. `albums` - contains a list of all the albums of the given artist/in The scripts will automatically

## Usage
Clone the repository and install all dependencies and run the script:
```
git clone https://github.com/AlbumShuffler/Generator.git shuffler-generator
cd shuffler-generator
npm i
```
Define a source file and get all the metadata using the approach described above. The generator needs three urls/paths to work properly:

1. location of the source file
2. location of the artist details
3. location of the albums for each artist/playlist

The location may either be files or https urls. File paths need to be prefixed with `file://` (e.g. `file:///path/to/my/files/${artistId}/albums`). For 2. & 3. all occurances of the string `${artistId}` will be replaced by proper artist ids.

There are two ways to configure the generator: by using a config file or environment variables.

### Configuration by file
Create a file like this:
```
{
  sourceUrl: "<insert url here>",
  artistDetailsUrl: "<insert url here>",
  albumsUrl: "<insert url here>",
}
```
and pass it to the program by using the `--config=/path/to/my/config.json` parameter.

### Configuration by environment variables
Set the following environment variables:
```
ALBUM_SHUFFLER_GENERATOR_SOURCE_URL
ALBUM_SHUFFLER_GENERATOR_ARTIST_DETAILS_URL
ALBUM_SHUFFLER_GENERATOR_ALBUMS_URL
```

### Authorization
This project currently supports access to private GitHub ressources by setting an authentication header.
You can set its values by using the parameter `--token=abcdefghij` or setting the `SPOTIFY_ALBUM_REPO_ACCESS_TOKEN` environment variable.

You can then run the project like this:
```
node index.js --token=<YOUR_AUTHORIZATION_TOKEN> --destination=output --config=config.json
```
and copy the Elm files into your project
```
cp output/*.elm /path/to/my/elm/app/src
```
