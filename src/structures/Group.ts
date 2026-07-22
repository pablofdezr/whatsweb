import type { GroupMetadata } from 'baileys';
import type { Client } from '../client/Client.js';

/**
 * Fluent handle for a group: run group operations without repeating the JID.
 *
 * @example
 * ```ts
 * const group = wa.group('120363...@g.us');
 * const meta = await group.metadata();
 * await group.addParticipants(['34600112233']);
 * console.log(await group.inviteLink());
 * ```
 */
export class Group {
  constructor(
    private readonly client: Client,
    /** Group JID. */
    public readonly id: string,
  ) {}

  /** Full group metadata (subject, participants, admins, …). */
  metadata(): Promise<GroupMetadata> {
    return this.client.getGroupMetadata(this.id);
  }

  addParticipants(participants: string | string[]) {
    return this.client.addGroupParticipants(this.id, participants);
  }

  removeParticipants(participants: string | string[]) {
    return this.client.removeGroupParticipants(this.id, participants);
  }

  promote(participants: string | string[]) {
    return this.client.promoteGroupParticipants(this.id, participants);
  }

  demote(participants: string | string[]) {
    return this.client.demoteGroupParticipants(this.id, participants);
  }

  setSubject(subject: string): Promise<void> {
    return this.client.updateGroupSubject(this.id, subject);
  }

  setDescription(description: string): Promise<void> {
    return this.client.updateGroupDescription(this.id, description);
  }

  /** Current invite link (`https://chat.whatsapp.com/…`). */
  inviteLink(): Promise<string> {
    return this.client.getGroupInviteLink(this.id);
  }

  /** Revokes the current invite link and returns the new one. */
  revokeInvite(): Promise<string> {
    return this.client.revokeGroupInviteLink(this.id);
  }

  /** Leaves the group. */
  leave(): Promise<void> {
    return this.client.leaveGroup(this.id);
  }
}
