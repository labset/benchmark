-- name: GetContent :one
SELECT * FROM content WHERE id = sqlc.arg('id');

-- name: ListContent :many
SELECT * FROM content ORDER BY created_at LIMIT sqlc.arg('limit') OFFSET sqlc.arg('offset');

-- name: CountContent :one
SELECT count(*) FROM content;

-- name: CreateContent :one
INSERT INTO content (title, body, status, tags)
VALUES (sqlc.arg('title'), sqlc.arg('body'), sqlc.arg('status'), sqlc.arg('tags'))
RETURNING *;

-- name: UpdateContent :one
UPDATE content
SET title = COALESCE(sqlc.narg('title'), title),
    body = COALESCE(sqlc.narg('body'), body),
    status = COALESCE(sqlc.narg('status'), status),
    tags = COALESCE(sqlc.narg('tags'), tags),
    updated_at = now()
WHERE id = sqlc.arg('id')
RETURNING *;

-- name: DeleteContent :execrows
DELETE FROM content WHERE id = sqlc.arg('id');
