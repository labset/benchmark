package main

import (
	"log"
	"net/http"

	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"

	"content-api-connect-rpc/gen/content/v1/contentv1connect"
	"content-api-connect-rpc/internal/service"
)

func main() {
	srv := service.NewContentServer()

	// gRPC / Connect handler on port 50051
	grpcMux := http.NewServeMux()
	path, handler := contentv1connect.NewContentServiceHandler(srv)
	grpcMux.Handle(path, handler)

	// Health check on port 8080
	healthMux := http.NewServeMux()
	healthMux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"up"}`))
	})

	go func() {
		log.Println("Health check listening on :8080")
		if err := http.ListenAndServe(":8080", healthMux); err != nil {
			log.Fatal(err)
		}
	}()

	grpcServer := &http.Server{
		Addr:    ":50051",
		Handler: h2c.NewHandler(grpcMux, &http2.Server{}),
	}
	log.Println("gRPC server listening on :50051")
	log.Fatal(grpcServer.ListenAndServe())
}
