import { integer, index, sqliteTable, text } from "drizzle-orm/sqlite-core"

export const Timestamps = {
  time_created: integer()
    .notNull()
    .$default(() => Date.now()),
  time_updated: integer()
    .notNull()
    .$default(() => Date.now()),
}

export const SessionTable = sqliteTable("session", {
  id: text().primaryKey(),
  directory: text().notNull(),
  title: text(),
  model: text(),
  ...Timestamps,
})

export const MessageTable = sqliteTable(
  "message",
  {
    id: text().primaryKey(),
    session_id: text()
      .notNull()
      .references(() => SessionTable.id, { onDelete: "cascade" }),
    role: text().notNull(),
    content: text().notNull(),
    ...Timestamps,
  },
  (table) => [index("message_session_created_idx").on(table.session_id, table.time_created)],
)
