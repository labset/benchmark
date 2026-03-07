package content

import (
	"context"

	"connectrpc.com/connect"

	contentv1 "content-api-connect-rpc/gen/proto/content/v1"
	"content-api-connect-rpc/pkg/connectutil"
)

func (h *handler) ListContent(
	ctx context.Context,
	req *connect.Request[contentv1.ListContentRequest],
) (*connect.Response[contentv1.ListContentResponse], error) {
	items, nextToken, err := h.service.List(ctx, req.Msg.PageSize, req.Msg.PageToken)
	if err != nil {
		return nil, connectutil.NewErrorFrom(err, errorMappings)
	}
	protoItems := make([]*contentv1.Content, len(items))
	for i := range items {
		protoItems[i] = toProto(&items[i])
	}
	return connect.NewResponse(&contentv1.ListContentResponse{
		Items:         protoItems,
		NextPageToken: nextToken,
	}), nil
}
