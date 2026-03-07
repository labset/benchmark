package content

import (
	"context"
	"strconv"

	sqlccontent "content-api-connect-rpc/gen/sqlc/content"
)

func (s *service) List(ctx context.Context, pageSize int32, pageToken string) ([]sqlccontent.Content, string, error) {
	offset := int32(0)
	if pageToken != "" {
		parsed, err := strconv.Atoi(pageToken)
		if err != nil {
			return nil, "", err
		}
		offset = int32(parsed)
	}

	items, err := s.queries.ListContent(ctx, sqlccontent.ListContentParams{
		Limit:  pageSize,
		Offset: offset,
	})
	if err != nil {
		return nil, "", err
	}

	var nextToken string
	if int32(len(items)) == pageSize {
		nextToken = strconv.Itoa(int(offset + pageSize))
	}

	return items, nextToken, nil
}
