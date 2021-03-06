package planet

import (
	"context"
	"fmt"
	"image"
	"image/draw"
	"image/png"
	"io"
	"math/rand"
	"strings"
	"sync"
	"time"

	"github.com/hashicorp/go-retryablehttp"
	"github.com/paulmach/orb/maptile"
	log "github.com/sirupsen/logrus"
)

const (
	TileSize = 256
)

func (p *Client) fetchTile(ctx context.Context, ID string, t maptile.Tile) (image.Image, error) {
	// TODO: domain selection could be improved to use some actual load balancing
	// or fallback mechanism.
	url := fmt.Sprintf("https://tiles%d.planet.com/data/v1/%s/%s/%d/%d/%d.png?api_key=%s", rand.Intn(4), ProductType, ID, t.Z, t.X, t.Y, p.GetAPIKey(ctx))

	log.Debugf("Fetching tile %q", ID)
	req, err := retryablehttp.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	res, err := planetHTTP().Do(req.WithContext(ctx))
	if res == nil {
		return nil, fmt.Errorf("http: %v", err)
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		buf := new(strings.Builder)
		io.Copy(buf, res.Body)
		return nil, fmt.Errorf("tile %v: %q", res.Status, buf.String())
	}

	return png.Decode(res.Body)
}

type imageAndID struct {
	ID    string
	Image image.Image
}

func blankImage() image.Image {
	return image.NewRGBA(image.Rectangle{
		Min: image.Point{X: 0, Y: 0},
		Max: image.Point{X: TileSize, Y: TileSize},
	})
}

// FetchTiles downloads tiles from the planet tile server to cover the provided tile. All the IDs provided are unioned.
func (p *Client) FetchTiles(pctx context.Context, IDs []string, t maptile.Tile) (image.Image, error) {
	if len(IDs) == 0 {
		return blankImage(), nil
	}
	ctx, cancel := context.WithDeadline(pctx, time.Now().Add(15*time.Second))
	defer cancel()

	var gerr error
	var l sync.Mutex
	m := make(map[string]image.Image)
	wg := &sync.WaitGroup{}

	// Fetch all images in parallel
	for _, ID := range IDs {
		wg.Add(1)
		go func(id string) {
			defer wg.Done()
			img, err := p.fetchTile(ctx, id, t)
			l.Lock()
			defer l.Unlock()
			if err != nil && gerr == nil {
				gerr = fmt.Errorf("%v: fetching tile %q", err, id)
				cancel()
				return
			}
			m[id] = img
		}(ID)
	}
	wg.Wait()
	if gerr != nil {
		return nil, gerr
	}

	var out *image.RGBA
	// Merge in reverse order. IDs will always be newest to oldest and we want
	// to overlap newest images on top.
	for i := len(IDs) - 1; i >= 0; i-- {
		img, ok := m[IDs[i]]
		if !ok {
			panic("expected ID in result")
		}
		if out == nil {
			out = image.NewRGBA(img.Bounds())
		}
		if out.Bounds() != img.Bounds() {
			return nil, fmt.Errorf("Bounds mismatch, %v vs %v", out.Bounds(), img.Bounds())
		}
		draw.Draw(out, img.Bounds(), img, image.Point{0, 0}, draw.Over)
	}
	if out == nil {
		panic("expected IDs")
	}
	return out, nil
}

func (p *Client) FetchThumb(pctx context.Context, ID string, w io.Writer) error {
	ctx, cancel := context.WithDeadline(pctx, time.Now().Add(15*time.Second))
	defer cancel()

	url := fmt.Sprintf("https://tiles%d.planet.com/data/v1/item-types/%s/items/%s/thumb?api_key=%s", rand.Intn(4), ProductType, ID, p.GetAPIKey(ctx))

	log.Debugf("Fetching thumb %q", ID)
	req, err := retryablehttp.NewRequest("GET", url, nil)
	if err != nil {
		return err
	}
	res, err := planetHTTP().Do(req.WithContext(ctx))
	if res == nil {
		return fmt.Errorf("http: %v", err)
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		buf := new(strings.Builder)
		io.Copy(buf, res.Body)
		return fmt.Errorf("thumb %v: %q", res.Status, buf.String())
	}

	if _, err := io.Copy(w, res.Body); err != nil {
		return err
	}
	return nil
}
