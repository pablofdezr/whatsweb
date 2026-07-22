import type { Context } from './Context.js';

/** Calls the next middleware in the chain. */
export type MiddlewareNext = () => Promise<void>;

/** Koa/Telegraf-style middleware: receives the context and `next`. */
export type Middleware = (ctx: Context, next: MiddlewareNext) => unknown | Promise<unknown>;

/** Terminal handler: receives the context and replies. */
export type Handler = (ctx: Context) => unknown | Promise<unknown>;

/** `hears` trigger: literal substring or regular expression. */
export type Trigger = string | RegExp;
