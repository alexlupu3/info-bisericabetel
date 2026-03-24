import { pgTable, text, uuid, integer, timestamp, jsonb, boolean, index } from 'drizzle-orm/pg-core'

export const sites = pgTable('sites', {
  slug:      text('slug').primaryKey(),
  name:      text('name').notNull(),
  accent:    text('accent').notNull(),
  address:   text('address'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const groups = pgTable('groups', {
  id:            uuid('id').primaryKey().defaultRandom(),
  title:         text('title').notNull(),
  sites:         text('sites').array().notNull().default([]),
  orderPosition: integer('order_position').notNull().default(0),
  state:         text('state').notNull().default('draft'),
  createdAt:     timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt:     timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const users = pgTable('users', {
  id:                 uuid('id').primaryKey().defaultRandom(),
  email:              text('email').notNull().unique(),
  passwordHash:       text('password_hash').notNull(),
  role:               text('role').notNull().default('admin'),
  mustChangePassword: boolean('must_change_password').notNull().default(true),
  createdAt:          timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt:          timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const auditLog = pgTable('audit_log', {
  id:         uuid('id').primaryKey().defaultRandom(),
  userId:     uuid('user_id'),
  userEmail:  text('user_email').notNull().default(''),
  action:     text('action').notNull(),
  entityType: text('entity_type').notNull().default('content'),
  entityId:   uuid('entity_id'),
  detail:     jsonb('detail').notNull().default({}),
  createdAt:  timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, t => [
  index('audit_log_entity_idx').on(t.entityType, t.entityId),
  index('audit_log_created_idx').on(t.createdAt),
])

export const media = pgTable('media', {
  id:           uuid('id').primaryKey().defaultRandom(),
  url:          text('url').notNull().unique(),
  filename:     text('filename').notNull(),
  originalName: text('original_name').notNull().default(''),
  size:         integer('size').notNull().default(0),
  mimeType:     text('mime_type').notNull().default(''),
  createdAt:    timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const analyticsEvents = pgTable('analytics_events', {
  id:         uuid('id').primaryKey().defaultRandom(),
  eventType:  text('event_type').notNull(),
  siteSlug:   text('site_slug'),
  itemId:     uuid('item_id'),
  url:        text('url'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
}, t => [
  index('analytics_events_type_occurred_idx').on(t.eventType, t.occurredAt),
  index('analytics_events_site_occurred_idx').on(t.siteSlug, t.occurredAt),
])

export const contentItems = pgTable('content_items', {
  id:            uuid('id').primaryKey().defaultRandom(),
  type:          text('type').notNull(),
  state:         text('state').notNull().default('draft'),
  sites:         text('sites').array().notNull().default([]),
  orderPosition: integer('order_position').notNull().default(0),
  groupId:       uuid('group_id').references(() => groups.id),
  expiresAt:     timestamp('expires_at', { withTimezone: true }),
  data:          jsonb('data').notNull().default({}),
  createdAt:     timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt:     timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})
