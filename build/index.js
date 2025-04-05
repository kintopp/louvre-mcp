import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import axios from 'axios';
import { z } from "zod";
import * as cheerio from 'cheerio';

const BASE_URL = "https://collections.louvre.fr";
const API_URL = `ark:/53355`;
const USER_AGENT = "louvremcp-app/1.0";

// Create server instance
const server = new McpServer({
    name: "louvreMCP",
    version: "1.0.0",
});

/**
 * Format artwork data for consistent response
 */
function formatArtworkData(artwork) {
    return {
        id: artwork.id || artwork.ark,
        ark: artwork.ark || artwork.id,
        title: artwork.title || '',
        artist: artwork.creator || '',
        date: artwork.date || '',
        medium: artwork.medium || '',
        dimensions: artwork.dimensions || '',
        description: artwork.description || '',
        image: artwork.image || [],
        url: `${BASE_URL}/${API_URL}/${artwork.id || artwork.ark}`,
    };
}

/**
 * Helper function to make API requests
 */
async function fetchLouvreAPI(path, params = {}) {
    const url = new URL(path, BASE_URL);
    
    // Add query parameters
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
            url.searchParams.append(key, String(value));
        }
    });
    
    // Append .json to get JSON response if needed
    if (!url.pathname.endsWith('.json') && !url.pathname.includes('.json?')) {
        url.pathname += '.json';
    }
    
    try {
        const response = await axios.get(url.toString());
        return response.data;
    }
    catch (error) {
        console.error('Error fetching from Louvre API:', error);
        throw error;
    }
}

server.tool("get-artwork-detail", "get details for an artwork in the Louvre", {
    id: z.string().describe("The ID of the artwork")
}, async ({ id }) => {
    const response = await fetchLouvreAPI(`/${API_URL}/${id}`);
    return {
        content: [
            {
                type: "text",
                text: `Here are the details for the artwork with ID ${id}:
                  Title: ${response.title}
                  Artist: ${response.artist}
                  Date: ${response.date}
                  Medium: ${response.medium}
                  Dimensions: ${response.dimensions}
                  Description: ${response.description}
                  Image URLs: ${response.image.join(', ')}
                  URL: ${response.url}`
            },
        ],
    };
});

server.tool("get-artwork-images", "get images for an artwork in the Louvre", {
    id: z.string().describe("The ID of the artwork"),
    type: z.enum(["thumbnail", "full", "all"]).optional().describe("The type of image to retrieve"),
    position: z.number().optional().describe("The position of the image to retrieve"),
    open_browser: z.boolean().optional().describe("If true, formats the response for easy URL opening")
}, async ({ id, type, position, open_browser = false }) => {
    try {
        // First get the artwork details using the API
        const artworkDetails = await fetchLouvreAPI(`/${API_URL}/${id}`);
        
        if (!artworkDetails.image || artworkDetails.image.length === 0) {
            // If we don't have images from the API, try scraping the HTML page
            return await getImagesFromHtml(id, type, position, open_browser);
        }
        
        // Process the image data from the API
        const processedImages = [];
        
        // Debug the image structure
        console.error("Image structure:", JSON.stringify(artworkDetails.image).substring(0, 500));
        
        // Handle different possible image data structures
        if (Array.isArray(artworkDetails.image)) {
            // If it's an array, process each item
            artworkDetails.image.forEach((img, index) => {
                let imgUrl;
                
                // Try to get URL based on different possible structures
                if (typeof img === 'string') {
                    imgUrl = img;
                } else if (img && typeof img === 'object') {
                    // Try common URL property names
                    imgUrl = img.url || img.uri || img.src || img.path;
                    
                    // If still no URL, just stringify the object for debugging
                    if (!imgUrl && open_browser) {
                        console.error(`Image ${index} structure:`, JSON.stringify(img).substring(0, 200));
                    }
                }
                
                // Only add if we found a URL
                if (imgUrl) {
                    // Ensure it's an absolute URL
                    if (imgUrl.startsWith('/')) {
                        imgUrl = `${BASE_URL}${imgUrl}`;
                    }
                    
                    processedImages.push({
                        position: index,
                        type: img.type || 'unspecified',
                        url: imgUrl
                    });
                }
            });
        } else if (typeof artworkDetails.image === 'object') {
            // It might be an object with URLs as properties
            Object.entries(artworkDetails.image).forEach(([key, value], index) => {
                let imgUrl;
                
                if (typeof value === 'string') {
                    imgUrl = value;
                } else if (value && typeof value === 'object' && (value.url || value.uri || value.src)) {
                    imgUrl = value.url || value.uri || value.src;
                }
                
                if (imgUrl) {
                    // Ensure it's an absolute URL
                    if (imgUrl.startsWith('/')) {
                        imgUrl = `${BASE_URL}${imgUrl}`;
                    }
                    
                    processedImages.push({
                        position: index,
                        type: key,
                        url: imgUrl
                    });
                }
            });
        }
        
        // If we still don't have any images, fall back to HTML scraping
        if (processedImages.length === 0) {
            return await getImagesFromHtml(id, type, position, open_browser);
        }
        
        // From here, process the images we found
        return formatImageResponse(id, type, position, processedImages, open_browser);
    } catch (error) {
        console.error("Error getting artwork images:", error);
        
        // Fall back to HTML scraping on error
        return await getImagesFromHtml(id, type, position, open_browser);
    }
});

/**
 * Fallback function to get images by scraping the HTML page
 */
async function getImagesFromHtml(id, type, position, open_browser) {
    try {
        // Fetch the HTML page for this artwork
        const response = await axios.get(`${BASE_URL}/${API_URL}/${id}`);
        const html = response.data;
        
        // Use cheerio to parse the HTML
        const $ = cheerio.load(html);
        
        // Find image elements in the page
        const images = [];
        
        // Find regular images
        $('img').each((index, element) => {
            const img = $(element);
            const src = img.attr('src') || img.attr('data-src');
            const alt = img.attr('alt') || '';
            
            if (src) {
                // Determine image type based on URL or size
                let imgType = 'unknown';
                if (src.includes('small') || src.includes('thumb')) {
                    imgType = 'thumbnail';
                } else if (src.includes('large') || src.includes('full')) {
                    imgType = 'full';
                }
                
                // Ensure it's an absolute URL
                const imgUrl = src.startsWith('/') ? `${BASE_URL}${src}` : src;
                
                images.push({
                    position: index,
                    type: imgType,
                    url: imgUrl,
                    alt: alt
                });
            }
        });
        
        // If we found images, format the response
        if (images.length > 0) {
            return formatImageResponse(id, type, position, images, open_browser);
        }
        
        // If no images were found, return a failure message
        return {
            content: [
                {
                    type: "text",
                    text: `Failed to find images for the artwork with ID ${id}`
                },
            ],
        };
    } catch (error) {
        console.error("Error scraping HTML for images:", error);
        
        // Return error message
        return {
            content: [
                {
                    type: "text",
                    text: `Error retrieving images for the artwork with ID ${id}: ${error.message}`
                },
            ],
        };
    }
}

/**
 * Format the image response based on the parameters
 */
function formatImageResponse(id, type, position, images, open_browser) {
    // If a specific position is requested, return just that image
    if (position !== undefined) {
        const positionNum = Number(position);
        const specificImage = images.find((img) => img.position === positionNum);
        
        if (!specificImage) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Failed to find image at position ${positionNum} for the artwork with ID ${id}`
                    },
                ],
            };
        }
        
        let responseText = `Here is the ${type || 'requested'} image at position ${positionNum} for the artwork with ID ${id}:`;
        
        if (open_browser) {
            responseText += `\n\nClick the following link to open in your browser:\n${specificImage.url}`;
        } else {
            responseText += `\n\n${specificImage.url}`;
        }
        
        return {
            content: [
                {
                    type: "text",
                    text: responseText
                },
            ],
        };
    }
    
    // Group images by type if we're not looking for a specific position
    const imagesByType = {};
    
    images.forEach((img) => {
        const imageType = img.type || 'unspecified';
        if (!imagesByType[imageType]) {
            imagesByType[imageType] = [];
        }
        imagesByType[imageType].push(img);
    });
    
    // Get available image types
    const availableTypes = Object.keys(imagesByType);
    
    // If a specific type is requested, filter to just that type
    if (type !== 'all' && type !== undefined) {
        // If requested type doesn't exist, use the first available type
        const selectedType = availableTypes.includes(type)
            ? type
            : availableTypes[0] || 'unspecified';
        
        // Get images of the selected type
        const selectedImages = imagesByType[selectedType] || [];
        
        // Sort images by position
        selectedImages.sort((a, b) => a.position - b.position);
        
        let responseText = `Here are the images for the artwork with ID ${id} and type ${type}:`;
        
        if (open_browser) {
            responseText += "\n\nClick any of the following links to open in your browser:";
            selectedImages.forEach((img, index) => {
                responseText += `\n${index + 1}. ${selectedType} image: ${img.url}`;
            });
        } else {
            responseText += "\n\n";
            selectedImages.forEach((img) => {
                responseText += `Type: ${selectedType}, URL: ${img.url}\n`;
            });
        }
        
        return {
            content: [
                {
                    type: "text",
                    text: responseText
                },
            ],
        };
    }
    
    // For 'all' type or when no type is specified
    let responseText = `Here are the images for the artwork with ID ${id}:`;
    
    if (open_browser) {
        responseText += "\n\nClick any of the following links to open in your browser:";
        let imgCount = 1;
        
        Object.entries(imagesByType).forEach(([imageType, typeImages]) => {
            typeImages.forEach((img) => {
                responseText += `\n${imgCount}. ${imageType} image: ${img.url}`;
                imgCount++;
            });
        });
    } else {
        responseText += "\n\n";
        Object.entries(imagesByType).forEach(([imageType, typeImages]) => {
            typeImages.forEach((img) => {
                responseText += `Type: ${imageType}, URL: ${img.url}\n`;
            });
        });
    }
    
    return {
        content: [
            {
                type: "text",
                text: responseText
            },
        ],
    };
}

server.tool("search-artwork", "search for an artwork in the Louvre", {
    query: z.string().describe("What do you want to search for?"),
    page: z.number().optional().describe("The page number of the search results"),
}, async ({ query, page }) => {
    if (!query) {
        return {
            content: [
                {
                    type: "text",
                    text: `Please provide a search query to find artwork in the Louvre`,
                },
            ],
        };
    }
    
    // Format the query for URL
    const formattedQuery = encodeURIComponent(query);
    const searchUrl = `https://collections.louvre.fr/recherche?page=${page || 1}&q=${formattedQuery}`;
    
    // Fetch the search results page
    const response = await axios.get(searchUrl);
    const html = response.data;
    
    // Use cheerio to parse the HTML
    const $ = cheerio.load(html);
    
    // Extract artwork information from the search results
    const artworks = [];
    
    // Find all artwork cards
    $('#search__grid .card__outer').each((index, element) => {
        // Extract the URL and ID
        const linkElement = $(element).find('a').first();
        const url = linkElement.attr('href');
        const id = url ? url.split('/').pop() : '';
        
        // Extract the image information
        const imgElement = $(element).find('img');
        const imageUrl = imgElement.attr('data-src') || imgElement.attr('src') || '';
        const fullTitle = imgElement.attr('title') || '';
        
        // Extract the title and author
        const titleElement = $(element).find('.card__title a');
        const title = titleElement.text().trim();
        const authorElement = $(element).find('.card__author');
        const author = authorElement.text().trim();
        
        // Add the artwork to the results
        artworks.push({
            ark: id || '', // Assuming 'id' is equivalent to 'ark', defaulting to an empty string if undefined
            id: id || '',
            title,
            artist: author, // Map 'author' to 'artist'
            date: '', // Add a placeholder or extract if available
            medium: '', // Add a placeholder or extract if available
            dimensions: '', // Add a placeholder or extract if available
            description: fullTitle, // Use 'fullTitle' as the description
            image: imageUrl ? [{ position: 0, type: 'thumbnail', url: imageUrl }] : [], // Wrap imageUrl in a LouvreImage array
            url: url ? `https://collections.louvre.fr${url}` : '',
        });
    });
    
    // Get pagination information
    const totalResultsText = $('.search__results__count').text().trim().split(' ')[0] || '0';
    const totalResults = parseInt(totalResultsText.replace(/\D/g, ''));
    const totalPages = Math.ceil(totalResults / 20);
    
    // Create a string variable to store all artwork information
    let artworksDetails = '';
    artworks.forEach((artwork) => {
        artworksDetails += `ID: ${artwork.id}\n`;
        artworksDetails += `Title: ${artwork.title}\n`;
        artworksDetails += `Artist: ${artwork.artist}\n`;
        artworksDetails += `Date: ${artwork.date}\n`;
        artworksDetails += `Medium: ${artwork.medium}\n`;
        artworksDetails += `Dimensions: ${artwork.dimensions}\n`;
        artworksDetails += `Description: ${artwork.description}\n`;
        artworksDetails += `Image URLs: ${artwork.image.map(img => img.url).join(', ')}\n`;
        artworksDetails += `URL: ${artwork.url}\n\n`;
    });
    
    return {
        content: [
            {
                type: "text",
                text: `Here are the search results for "${query}" in the Louvre in Paris:\n\n${artworksDetails}`
            },
        ],
    };
});

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Louvre MCP Server running on stdio");
}

main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
});