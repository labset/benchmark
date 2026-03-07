package main

import (
	"connectrpc.com/connect"

	contentv1connect "content-api-connect-rpc/gen/proto/content/v1/contentv1connect"
	contentapi "content-api-connect-rpc/internal/api/content"
	"content-api-connect-rpc/pkg/config"
	"content-api-connect-rpc/pkg/connectapp"
	"content-api-connect-rpc/pkg/connectutil"
)

func setupGateway(cfg *config.Config, domains *Domains) connectapp.App {
	application := connectapp.New(connectapp.WithAddr(cfg.ServerAddr))
	interceptors := connectutil.NewInterceptors()

	contentHandler := contentapi.New(contentapi.Dependencies{Service: domains.Content})
	path, h := contentv1connect.NewContentServiceHandler(
		contentHandler,
		connect.WithInterceptors(interceptors...),
	)
	application.Handle(path, h)

	return application
}
