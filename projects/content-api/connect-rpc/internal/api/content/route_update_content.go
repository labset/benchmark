package content

import (
	"context"

	"connectrpc.com/connect"
	"github.com/gofrs/uuid/v5"

	contentv1 "content-api-connect-rpc/gen/proto/content/v1"
	"content-api-connect-rpc/pkg/connectutil"
)

func (h *handler) UpdateContent(
	ctx context.Context,
	req *connect.Request[contentv1.UpdateContentRequest],
) (*connect.Response[contentv1.UpdateContentResponse], error) {
	id, err := uuid.FromString(req.Msg.Id)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}
	params := fromProtoUpdate(req.Msg)
	result, err := h.service.Update(ctx, id, params)
	if err != nil {
		return nil, connectutil.NewErrorFrom(err, errorMappings)
	}
	return connect.NewResponse(&contentv1.UpdateContentResponse{
		Content: toProto(result),
	}), nil
}
