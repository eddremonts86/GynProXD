/// <reference path="../pb_data/types.d.ts" />
/**
 * Pictures on a gym broadcast.
 *
 * A gym selling a clip card, a clinic or a plate of food was allowed one line
 * of body text and no picture at all, which is not how anybody sells anything.
 * The message bus is plaintext directory data by design, but an image is not
 * text: it does not belong in localStorage as a data URL — a couple of photos
 * would eat the whole 5 MB quota the training history also lives in — and it
 * does not belong in the json payload either.
 *
 * So the files sit here, on the row that owns them, and travel to members as
 * URLs. Four is the cap: a broadcast, not an album. The client downscales
 * before upload, so `maxSize` is a backstop against a raw camera dump rather
 * than the working limit.
 *
 * Alt text rides in `payload.alts`, aligned by index with the upload order,
 * because the operator writes it before PocketBase has named the files.
 */
migrate(
  (app) => {
    const messages = app.findCollectionByNameOrId('gym_messages')
    messages.fields.add(
      new Field({
        name: 'images',
        type: 'file',
        maxSelect: 4,
        maxSize: 3145728,
        mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
        thumbs: ['600x0'],
      }),
    )
    app.save(messages)
  },
  (app) => {
    const messages = app.findCollectionByNameOrId('gym_messages')
    const images = messages.fields.getByName('images')
    if (images) {
      messages.fields.removeById(images.id)
      app.save(messages)
    }
  },
)
