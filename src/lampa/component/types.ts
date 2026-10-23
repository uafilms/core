import type {
  LampaActivityObject,
  LampaMovie,
  OmssProviderItem,
  TmdbEpisodeItem,
} from '../types/index.js';

export interface ComponentState {
  lastFocusElement: any;
  selectedEpisodeNumber: number;
  initialized: boolean;
  viewMode?: 'episodes' | 'sources';
  activeSeason: number;
  activeProvider: string;
  activeVoice: string;
  userManuallySelectedProvider: boolean;
  userManuallySelectedVoice: boolean;
  selectedEpisode: TmdbEpisodeItem | null;
  seasonEpisodes: TmdbEpisodeItem[];
  currentProvidersMap: Map<string, OmssProviderItem>;
  probedSeason?: number;
  probedEpisode?: number;
  currentImages: HTMLImageElement[];
  currentStreamCancel: (() => void) | null;
  isPlaybackActive: boolean;
}

export interface ComponentContext {
  self: any;
  object: LampaActivityObject;
  movie: LampaMovie;
  isTv: boolean;
  host: string;
  scroll: any;
  filter: any;
  files: any;
  state: ComponentState;
  filterTranslate: {
    season: string;
    voice: string;
    source: string;
  };
}
