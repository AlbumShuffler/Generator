import { Eta } from 'eta'
import path from 'path';
import fs from 'fs';
import https from 'https';

const eta = new Eta({ views: './templates', debug: true })

const artistListUrl = 'https://raw.githubusercontent.com/b0wter/shuffler-albums/main/input/source.json';

async function getArtistSources() {
    const res = await fetch(artistListUrl);
    return await res.json();
}

async function getArtistDetails(artistId) {
    const url = `https://raw.githubusercontent.com/b0wter/shuffler-albums/main/output/${artistId}/artist`
    const res = await fetch(url);
    return await res.json();   
}

async function getAlbumsForArtist(artistId) {
    const url = `https://raw.githubusercontent.com/b0wter/shuffler-albums/main/output/${artistId}/albums`;
    const res = await fetch(url);
    return await res.json();
}

function renderArtistAlbumStorageTemplate(artistDetails, albums, moduleName) {
    const withConvertedCovers =
        albums.map(album => {
            album.firstImage = album.images[0]
            if (album.images.length > 1) {
                album.images.shift();
            }
            if (album.name.includes("\"")) {
                album.name = album.name.replaceAll('\"', '\\\"');
            }
            return album;
        });

    if (albums.length === 0) {
        throw new Error('No album data available')
    }
    const head = withConvertedCovers[0];

    let tail = []
    if (albums.length > 1) {
        withConvertedCovers.shift();
        tail = withConvertedCovers;
    }

    return eta.render('albumstorage-for-artists', { artist: artistDetails, firstAlbum: head, albums: tail, moduleName: moduleName });
}

function renderGlobalAlbumStorageTemplate(moduleNames) {
    return eta.render('artists-with-albums', { moduleNames: moduleNames})
}

function writeTextToFile(content, filename) {
    fs.writeFileSync(filename, content, 'utf8')
}

async function handleArtist(artistId) {
    const artistDetails = await getArtistDetails(artistId);
    const albums = await getAlbumsForArtist(artistId);
    const moduleName = artistDetails.httpFriendlyShortName[0].toUpperCase() + artistDetails.httpFriendlyShortName.slice(1);
    const template = renderArtistAlbumStorageTemplate(artistDetails, albums, moduleName);
    writeTextToFile(template, `AlbumStorage${moduleName}.elm`)
}

(async () => {
    try {
        const artistSources = await getArtistSources();
        const artistShortNames = artistSources.map(a => a.httpFriendlyShortName);
        const artistIds = artistSources.map(a => a.id);

        if (new Set(artistShortNames).size !== artistShortNames.length) {
            console.error(new Set(artistShortNames), artistShortNames)
            throw new Error('There are duplicate http friendly short names')
        }

        console.log('Got artist ids', artistIds);
        for(const artistId of artistIds) {
            console.log('Handling artist', artistId);
            handleArtist(artistId);
        }
        
        const global = renderGlobalAlbumStorageTemplate(artistShortNames.map(n => n[0].toUpperCase() + n.slice(1)));
        writeTextToFile(global, `ArtistsWithAlbums.elm`)
    } catch(err) {
        console.log('Could not get artist list because', err);
    }
})();
