import { Eta } from 'eta'
import path from 'path';
import fs from 'fs';
import url from 'url'
import https from 'https'
import sizeOf from 'image-size'

const eta = new Eta({ views: './templates', debug: true })

const NUMBER_OF_REQUIRED_BYTES_FOR_IMAGE_HEAD = 5000;

function createAuthOptions(accessToken) {
    if (!accessToken) {
        throw new Error('Cannot create auth options without access token');
    }
    return {
        headers: {
            'Authorization': `token ${accessToken}`
        }
    };
}

function getAccessToken() {
    const fromArg = process.argv.slice(2).find(arg => arg.startsWith("--token="));
    const formEnv = process.env.SPOTIFY_ALBUM_REPO_ACCESS_TOKEN;
    return fromArg ? fromArg.split('=')[1] : formEnv;
}

/**
 * @typedef {Object} Dimensions
 * @property {number} width
 * @property {number} height
 */

/**
 * Returns the dimensions of an image hosted on the web
 * @param {string} imageUrl
 * @return {Promise<Dimensions>}
 */
function getRemoteImageDimensions(imageUrl) {
    // Wrapping the Request in a promise so it's nicer to use in an async function
    const options = url.parse(imageUrl)
    return new Promise((resolve, reject) => {
        const req = https.get(options, (response) => {
            const chunks = [];
            response.on("data", (chunk) => {
                chunks.push(chunk);
                const numberOfReceivedBytes = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
                if(numberOfReceivedBytes >= NUMBER_OF_REQUIRED_BYTES_FOR_IMAGE_HEAD) {
                    console.log(`Got enough bytes (required >= ${NUMBER_OF_REQUIRED_BYTES_FOR_IMAGE_HEAD} got ${numberOfReceivedBytes}) to check the image header, ending request prematurely`)
                    // Calling will still trigger the 'end' event.
                    response.destroy(); 
                }
            });

            response.on("end", () => {
                const dimensions = sizeOf(Buffer.concat(chunks));
                resolve(dimensions);
            });

            req.end();
        });
    });
}

async function sleep(milliSeconds) {
    return new Promise((resolve) =>setTimeout(resolve, milliSeconds));
}

async function doubleRetryGetRemoteImageDimensions(imageUrl) {
    // This is not a good way to make things happen but it solved all problems =)
    try {
        return await getRemoteImageDimensions(imageUrl);
    } catch(error) {
        console.warn('Error on first attempt of retrieving remote image dimensions', error);
        try {
            await sleep(500);
            return await getRemoteImageDimensions(imageUrl);
        } catch(error) {
            console.warn('Error on second attempt of retrieving remote image dimensions', error);
            await sleep(500);
            console.log('Trying a final time');
            return await getRemoteImageDimensions(imageUrl);
        }
    }
}

async function getJsonFromUrl(url, authOptions) {
    const res = await fetch(url, authOptions);
    if (!res.ok && res.status === 404) {
        throw new Error(`Encountered a 404 while accesing '${url}', did you supply a valid access token?`);
    } else if(!res.ok) {
        throw new Error(`Error accessing '${url}': ${res.status} ${res.statusText}`);
    }
    return res.json();
}

function getArtistSources(authOptions) {
    const url = 'https://raw.githubusercontent.com/AlbumShuffler/Albums/main/input/source.json';
    return getJsonFromUrl(url, authOptions);
}

async function getArtistDetails(artistId, authOptions) {
    const url = `https://raw.githubusercontent.com/AlbumShuffler/Albums/main/output/${artistId}/artist`;
    const artistDetails = await getJsonFromUrl(url, authOptions);
    artistDetails.coverCenterX = artistDetails.coverCenterX ? artistDetails.coverCenterX : 50;
    artistDetails.coverCenterY = artistDetails.coverCenterY ? artistDetails.coverCenterY : 50;
    artistDetails.altCoverCenterX = artistDetails.altCoverCenterX ? "Just " + artistDetails.altCoverCenterX : "Nothing";
    artistDetails.altCoverCenterY = artistDetails.altCoverCenterY ? "Just " + artistDetails.altCoverCenterY : "Nothing";
    const updatedImagePromises = artistDetails.images.map(async image => {
        if(!image.width || !image.height) {
            console.log('Missing width/height data for artist', artistId)
            const dimensions = await doubleRetryGetRemoteImageDimensions(image.url)
            image.width = dimensions.width;
            image.height = dimensions.height;
        }
        return image;
    });
    const updatedImages = await Promise.all(updatedImagePromises);
    return artistDetails;
}

function getAlbumsForArtist(artistId, authOptions) {
    const url = `https://raw.githubusercontent.com/AlbumShuffler/Albums/main/output/${artistId}/albums`;
    return getJsonFromUrl(url, authOptions);
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

async function handleArtist(artistId, destinationFolder, authOptions) {
    const artistDetails = await getArtistDetails(artistId, authOptions);
    const albums = await getAlbumsForArtist(artistId, authOptions);
    console.log('Found', albums.length, 'albums for', artistDetails.name);
    const moduleName = artistDetails.httpFriendlyShortName[0].toUpperCase() + artistDetails.httpFriendlyShortName.slice(1);
    const template = renderArtistAlbumStorageTemplate(artistDetails, albums, moduleName);
    writeTextToFile(template, path.join(destinationFolder, `AlbumStorage${moduleName}.elm`));
}

function getDestination() {
    const fromArgs = process.argv.slice(2).find(arg => arg.startsWith("--destination="));
    const fallback = 'output';
    const destination = fromArgs ? fromArgs.split('=')[1] : fallback;
    console.log('Got destination', destination);
    return destination;
}

function makeSureFolderExists(path) {
    if (!fs.existsSync(path)) {
        fs.mkdirSync(path);
    }
}

function throwIfThereAreDuplicates(artistShortNames) {
    if (new Set(artistShortNames).size !== artistShortNames.length) {
        console.error(new Set(artistShortNames), artistShortNames)
        throw new Error('There are duplicate http friendly short names')
    }
}

(async () => {
    try {
        const authOptions = createAuthOptions(getAccessToken());
        const destination = getDestination();
        makeSureFolderExists(destination);

        const artistSources = await getArtistSources(authOptions);
        const artistShortNames = artistSources.map(a => a.httpFriendlyShortName);
        throwIfThereAreDuplicates(artistShortNames);

        const artistIds = artistSources.map(a => a.id);
        console.log('Got artist ids', artistIds);
        for(const artistId of artistIds) {
            console.log('Handling artist', artistId);
            handleArtist(artistId, destination, authOptions);
        }
        
        const global = renderGlobalAlbumStorageTemplate(artistShortNames.map(n => n[0].toUpperCase() + n.slice(1)));
        writeTextToFile(global, path.join(destination, `ArtistsWithAlbums.elm`));
    } catch(err) {
        console.log('Could not get artist list because', err);
    }
})();
