package connectapp

import (
	"context"
	"net/http"

	"github.com/rs/zerolog/log"
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"
)

type App interface {
	Handle(path string, handler http.Handler)
	Run(ctx context.Context) error
}

type Option func(*app)

func WithAddr(addr string) Option { return func(a *app) { a.addr = addr } }

func New(opts ...Option) App {
	a := &app{addr: ":8080", mux: http.NewServeMux()}
	for _, o := range opts {
		o(a)
	}
	a.mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"up"}`))
	})
	return a
}

type app struct {
	addr string
	mux  *http.ServeMux
}

func (a *app) Handle(path string, handler http.Handler) {
	a.mux.Handle(path, handler)
}

func (a *app) Run(ctx context.Context) error {
	server := &http.Server{
		Addr:    a.addr,
		Handler: h2c.NewHandler(a.mux, &http2.Server{}),
	}

	log.Info().Str("addr", a.addr).Msg("server started")

	errCh := make(chan error, 1)
	go func() { errCh <- server.ListenAndServe() }()

	select {
	case <-ctx.Done():
		return server.Close()
	case err := <-errCh:
		return err
	}
}
