import type { MiscMessageGenerationOptions } from 'baileys';
import type { MediaKind } from '../media/detect.js';

/** Text send options. `mentions` are JIDs/numbers to tag (@) in the message. */
export interface TextOptions extends MiscMessageGenerationOptions {
  mentions?: string[];
}

/** Send options with a caption (image/video). */
export interface CaptionOptions extends MiscMessageGenerationOptions {
  caption?: string;
  /** JIDs/numbers to mention (@) in the caption. */
  mentions?: string[];
}

/** A poll to send. */
export interface PollInput {
  /** The poll question. */
  name: string;
  /** The available answers. */
  options: string[];
  /** How many answers a voter may pick. Defaults to `1`. */
  selectableCount?: number;
}

/** A contact card to send as a vCard. */
export interface ContactCard {
  /** Full display name. */
  fullName: string;
  /** Phone number in international format, e.g. `'34600112233'`. */
  phone: string;
  /** Optional organization/company. */
  organization?: string;
}

/** Options for `sendFromLink`. The media kind is auto-detected unless `type` is set. */
export interface SendFromLinkOptions extends MiscMessageGenerationOptions {
  /** Force the media kind instead of auto-detecting it from the link. */
  type?: MediaKind;
  /** Caption for image/video/document. */
  caption?: string;
  /** File name for documents (defaults to the name in the link). */
  fileName?: string;
  /** MIME type override. */
  mimetype?: string;
  /** Send audio as a voice note. */
  ptt?: boolean;
}

/** Audio send options. `ptt: true` sends it as a voice note. */
export interface AudioOptions extends MiscMessageGenerationOptions {
  ptt?: boolean;
  mimetype?: string;
}

/** Document send options. */
export interface DocumentOptions extends MiscMessageGenerationOptions {
  fileName?: string;
  mimetype?: string;
  caption?: string;
}

/** Coordinates and data for a location. */
export interface LocationInput {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}
