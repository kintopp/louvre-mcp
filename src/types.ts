export interface ArtworkDetails {
  id: any;
  medium: any;
  description: any;
  arkId: string;
  url: string;
  title: string;
  displayDateCreated: string;
  currentLocation: string;
  room: string;
  dateCreated: DateCreated[];
  creator: Creator[];
  inscriptions: string;
  dimension: Dimension[];
  objectHistory: string;
  acquisitionDetails: AcquisitionDetails[];
  ownedBy: string;
  image: Image[];
}

export interface DateCreated {
  startYear: number;
  endYear: number;
  imprecision: string;
  text: string;
  type: string;
  doubt: string;
}

export interface Creator {
  label: string;
  attributionLevel: string;
  linkType: string;
  dates?: CreatorDate[];
  creatorRole: string;
  authenticationType: string;
  doubt: string;
  attributedBy: string;
  attributedYear: string;
  wikidata: string;
}

export interface CreatorDate {
  date: string;
  place: string;
  type: string;
}

export interface Dimension {
  type: string;
  value: string;
  displayDimension: string;
  unit: string;
  anteriorPrecision: string;
  posteriorPrecision: string;
  tri: number;
  note: string;
}

export interface AcquisitionDetails {
  mode: string;
  doubt: string;
  dates: AcquisitionDate[];
}

export interface AcquisitionDate {
  type: string;
  value: string;
  startYear: number;
  endYear: number;
}

export interface Image {
  urlImage: string;
  urlThumbnail: string;
  copyright: string;
  type: string;
  position: number;
}