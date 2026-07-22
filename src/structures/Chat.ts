import type { AnyMessageContent, MiscMessageGenerationOptions } from 'baileys';
import type { Client } from '../client/Client.js';
import type {
  AudioOptions,
  CaptionOptions,
  DocumentOptions,
  LocationInput,
  SendFromLinkOptions,
  TextOptions,
} from '../client/send-options.js';
import type { MediaSource } from '../media/resolve.js';
import { isGroupJid } from '../util/jid.js';
import type { Message } from './Message.js';

/**
 * Fluent chat handle: send without having to repeat the recipient.
 *
 * @example
 * ```ts
 * const chat = wa.chat('34600112233');
 * await chat.text('hi!');
 * await chat.image('./cat.jpg', { caption: 'meow' });
 * ```
 */
export class Chat {
  constructor(
    protected readonly client: Client,
    /** Chat JID. */
    public readonly id: string,
    /** Chat name, if known. */
    public readonly name?: string,
  ) {}

  /** Is it a group? */
  get isGroup(): boolean {
    return isGroupJid(this.id);
  }

  /** Sends raw Baileys content (or text). */
  send(
    content: string | AnyMessageContent,
    options?: MiscMessageGenerationOptions,
  ): Promise<Message> {
    return this.client.send(this.id, content, options);
  }

  text(body: string, options?: TextOptions): Promise<Message> {
    return this.client.sendText(this.id, body, options);
  }

  image(source: MediaSource, options?: CaptionOptions): Promise<Message> {
    return this.client.sendImage(this.id, source, options);
  }

  video(source: MediaSource, options?: CaptionOptions): Promise<Message> {
    return this.client.sendVideo(this.id, source, options);
  }

  audio(source: MediaSource, options?: AudioOptions): Promise<Message> {
    return this.client.sendAudio(this.id, source, options);
  }

  /** Voice note (audio with `ptt: true`). */
  voice(source: MediaSource, options?: MiscMessageGenerationOptions): Promise<Message> {
    return this.client.sendVoice(this.id, source, options);
  }

  document(source: MediaSource, options?: DocumentOptions): Promise<Message> {
    return this.client.sendDocument(this.id, source, options);
  }

  location(location: LocationInput, options?: MiscMessageGenerationOptions): Promise<Message> {
    return this.client.sendLocation(this.id, location, options);
  }

  /** Sends whatever a link points to, auto-detecting the media kind. */
  fromLink(link: string, options?: SendFromLinkOptions): Promise<Message> {
    return this.client.sendFromLink(this.id, link, options);
  }

  /** Shows "typing…". Returns a function to stop showing it. */
  async typing(): Promise<() => Promise<void>> {
    await this.client.socket.sendPresenceUpdate('composing', this.id);
    return async () => {
      await this.client.socket.sendPresenceUpdate('paused', this.id);
    };
  }

  /** Profile picture URL of this chat/contact. */
  profilePictureUrl(highRes = false): Promise<string | undefined> {
    return this.client.getProfilePictureUrl(this.id, highRes);
  }

  /** Subscribes to this contact's presence updates. */
  subscribePresence(): Promise<void> {
    return this.client.subscribeToPresence(this.id);
  }

  /** Blocks this contact. */
  block(): Promise<void> {
    return this.client.blockUser(this.id);
  }

  /** Unblocks this contact. */
  unblock(): Promise<void> {
    return this.client.unblockUser(this.id);
  }
}
