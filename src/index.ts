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

interface Artwork {
    ark: string;
    id: string;
    title: string;
    artist: string;
    date: string;
    medium: string;
    dimensions: string;
    description: string;
    image: LouvreImage[];
    url: string;
    }

    interface LouvreImage {
        position: number;   
        type: string;
        url: string;
    }


/**
 * Format artwork data for consistent response
 */
function formatArtworkData(artwork: any) : Artwork {
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
async function fetchLouvreAPI(path: string, params: Record<string, any> = {}) {
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
      return response.data as Artwork;
    } catch (error) {
      console.error('Error fetching from Louvre API:', error);
      throw error;
    }
  }

server.tool(
    "get-artwork-detail",
    "get details for an artwork in the Louvre",
    {
        id: z.string().describe("The ID of the artwork")
    },
    async ({id}) => {
        const response : Artwork = await fetchLouvreAPI(`/${API_URL}/${id}`) as Artwork;
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
    }
);

server.tool(
    "get-artwork-images",
    "get images for an artwork in the Louvre",
    {
        id: z.string().describe("The ID of the artwork"),
        type: z.enum(["thumbnail", "full", "all"]).optional().describe("The type of image to retrieve"),
        position: z.number().optional().describe("The position of the image to retrieve")
    },
    async ({id, type, position}) => {
        const artworkDetails = await fetchLouvreAPI(`/${API_URL}/${id}`);
        if (!artworkDetails.image || artworkDetails.image.length === 0) {
            return {
                content: [
                  {
                    type: "text",
                    text: `Failed to find images for the artwork with ID ${id}`,
                  },
                ],
              };
          }

        // If a specific position is requested, return just that image
        if (position !== undefined) {
            const positionNum = Number(position);
            const specificImage = artworkDetails.image.find((img: any) => img.position === positionNum);
            
            if (!specificImage) {
                return {
                    content: [
                      {
                        type: "text",
                        text: `Failed to find image at position ${positionNum} for the artwork with ID ${id}`,
                      },
                    ],
                  };
            }

            return {
                content: [
                  {
                    type: "text",
                    text: `Here is the ${type} image at position ${positionNum} for the artwork with ID ${id}: ${specificImage.url}`
                  },
                ],
              };
            }
            
        // Group images by type
        const imagesByType: Record<string, LouvreImage[]> = {};
        
        // Process all images and group them by type
        artworkDetails.image.forEach((img: LouvreImage) => {
        const imageType = img.type || 'unspecified';
        if (!imagesByType[imageType]) {
            imagesByType[imageType] = [];
        }
        imagesByType[imageType].push(img);
        });
        
        // Get available image types
        const availableTypes = Object.keys(imagesByType);
        
        let imageDetails = '';
          Object.entries(imagesByType).forEach(([imageType, images]) => {
              images.forEach((img) => {
                  imageDetailsSelected += `Type: ${imageType}, URL: ${img.url}\n`;
              });
          });

        // If type is 'all', return all images
        if (type === 'all' || !type) {
          
            return {
                content: [
                {
                    type: "text",
                    text: `Here are the images for the artwork with ID ${id}:\n${imageDetails}`
                },
                ],
            };
        }
        
        // If requested type doesn't exist, use the first available type
        const selectedType = availableTypes.includes(type as string) 
        ? type as string 
        : availableTypes[0] || 'unspecified';
        
        // Get images of the selected type
        const selectedImages = imagesByType[selectedType] || [];
        
        // Sort images by position
        selectedImages.sort((a, b) => a.position - b.position);

        let imageDetailsSelected = '';
          Object.entries(imagesByType).forEach(([imageType, images]) => {
              images.forEach((img) => {
                  imageDetails += `Type: ${imageType}, URL: ${img.url}\n`;
              });
          });
        
        return {
            content: [
            {
                type: "text",
                text: `Here are the images for the artwork with ID ${id} and type ${type}:\n${imageDetailsSelected}`
            },
            ],
        };
    }
);

server.tool(
    "search-artwork",
    "search for an artwork in the Louvre",
    {
        query: z.string().describe("What do you want to search for?"),
        page: z.number().optional().describe("The page number of the search results"),
    },
    async ({query, page}) => {
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
    const formattedQuery = encodeURIComponent(query as string);
    const searchUrl = `https://collections.louvre.fr/recherche?page=${page}&q=${formattedQuery}`;
    
    // Fetch the search results page
    const response = await axios.get(searchUrl);
    const html = response.data as string;
    
    // Use cheerio to parse the HTML
    const $ = cheerio.load(html);
    
    // Extract artwork information from the search results
    const artworks: Artwork[] = [];
    
    // Find all artwork cards
    $('#search__grid .card__outer').each((index: number, element: any) => {
      // Extract the URL and ID
      const linkElement = $(element).find('a').first();
      const url = linkElement.attr('href');
      const id = url ? url.split('/').pop() : '';
      
      // Extract the image information
      const imgElement = $(element).find('img');
      const imageUrl = imgElement.attr('data-src') || '';
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
    
    }
);

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Louvre MCP Server running on stdio");
  }
  
  main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
  });