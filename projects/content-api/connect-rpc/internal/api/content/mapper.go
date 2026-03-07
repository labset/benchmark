package content

import (
	"github.com/jackc/pgx/v5/pgtype"
	"google.golang.org/protobuf/types/known/timestamppb"

	contentv1 "content-api-connect-rpc/gen/proto/content/v1"
	sqlccontent "content-api-connect-rpc/gen/sqlc/content"
)

func toProto(item *sqlccontent.Content) *contentv1.Content {
	return &contentv1.Content{
		Id:        item.ID.String(),
		Title:     item.Title,
		Body:      item.Body,
		Status:    contentv1.ContentStatus(item.Status),
		Tags:      item.Tags,
		CreatedAt: timestamppb.New(item.CreatedAt),
		UpdatedAt: timestamppb.New(item.UpdatedAt),
	}
}

func fromProtoCreate(msg *contentv1.CreateContentRequest) sqlccontent.CreateContentParams {
	return sqlccontent.CreateContentParams{
		Title:  msg.Title,
		Body:   msg.Body,
		Status: int32(msg.Status),
		Tags:   msg.Tags,
	}
}

func fromProtoUpdate(msg *contentv1.UpdateContentRequest) sqlccontent.UpdateContentParams {
	params := sqlccontent.UpdateContentParams{}
	if msg.UpdateMask == nil {
		return params
	}
	for _, path := range msg.UpdateMask.Paths {
		switch path {
		case "title":
			params.Title = pgtype.Text{String: msg.Content.Title, Valid: true}
		case "body":
			params.Body = pgtype.Text{String: msg.Content.Body, Valid: true}
		case "status":
			params.Status = pgtype.Int4{Int32: int32(msg.Content.Status), Valid: true}
		case "tags":
			params.Tags = msg.Content.Tags
		}
	}
	return params
}
