package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"mime"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"strings"
	"time"
)

const address = "127.0.0.1:17371"
const origin = "http://" + address
const updatePrefix = "/__wanxiang_native/v1/"

type asset struct {
	Path   string `json:"path"`
	Bytes  int64  `json:"bytes"`
	SHA256 string `json:"sha256"`
}

type webFiles struct {
	bundled  *os.Root
	updates  string
	deferred map[string]asset
}

func loadFiles(dir, updates string) (*webFiles, error) {
	root, err := os.OpenRoot(dir)
	if err != nil {
		return nil, err
	}
	defer func() {
		if err != nil {
			root.Close()
		}
	}()
	content, err := root.ReadFile("chunks.json")
	if err != nil {
		return nil, err
	}
	var index struct {
		Chunks []struct {
			Delivery string  `json:"delivery"`
			Files    []asset `json:"files"`
		} `json:"chunks"`
	}
	if err = json.Unmarshal(content, &index); err != nil {
		return nil, err
	}
	files := &webFiles{root, updates, make(map[string]asset)}
	for _, chunk := range index.Chunks {
		if chunk.Delivery == "initial" {
			continue
		}
		for _, entry := range chunk.Files {
			decoded, hashErr := hex.DecodeString(entry.SHA256)
			if !strings.HasPrefix(entry.Path, "assets/") || hashErr != nil ||
				len(decoded) != sha256.Size || entry.Bytes < 0 || entry.Bytes > (1<<53)-1 {
				err = fmt.Errorf("invalid deferred asset %q", entry.Path)
				return nil, err
			}
			files.deferred[entry.Path] = entry
		}
	}
	return files, nil
}

func (files *webFiles) diskPath(area string, entry asset) string {
	return filepath.Join(files.updates, area, entry.SHA256)
}

func matches(reader io.Reader, entry asset) bool {
	digest := sha256.New()
	count, err := io.Copy(digest, io.LimitReader(reader, entry.Bytes+1))
	return err == nil && count == entry.Bytes && hex.EncodeToString(digest.Sum(nil)) == entry.SHA256
}

func (files *webFiles) openStored(area string, entry asset) *os.File {
	file, err := os.Open(files.diskPath(area, entry))
	if err != nil {
		return nil
	}
	if area == "partial" {
		return file
	}
	if matches(file, entry) {
		if _, err := file.Seek(0, io.SeekStart); err == nil {
			return file
		}
	}
	file.Close()
	return nil
}

func writeStored(target, area string, entry asset, body io.Reader) error {
	if err := os.MkdirAll(filepath.Dir(target), 0700); err != nil {
		return err
	}
	file, err := os.CreateTemp(filepath.Dir(target), "download-*")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	digest := sha256.New()
	count, copyErr := io.Copy(io.MultiWriter(file, digest), io.LimitReader(body, entry.Bytes+1))
	closeErr := file.Close()
	if err := errors.Join(copyErr, closeErr); err != nil {
		return err
	}
	if count > entry.Bytes || (area == "verified" &&
		(count != entry.Bytes || hex.EncodeToString(digest.Sum(nil)) != entry.SHA256)) {
		return errors.New("invalid update payload")
	}
	return os.Rename(file.Name(), target)
}

func serveFile(w http.ResponseWriter, r *http.Request, file *os.File, name string) {
	defer file.Close()
	info, err := file.Stat()
	if err != nil || !info.Mode().IsRegular() {
		http.NotFound(w, r)
		return
	}
	http.ServeContent(w, r, name, time.Time{}, file)
}

func (files *webFiles) serveUpdate(w http.ResponseWriter, r *http.Request) {
	parts := strings.SplitN(strings.TrimPrefix(r.URL.Path, updatePrefix), "/", 3)
	if len(parts) != 3 || (parts[0] != "verified" && parts[0] != "partial") {
		http.NotFound(w, r)
		return
	}
	area := parts[0]
	entry, found := files.deferred[parts[2]]
	if !found || entry.SHA256 != parts[1] {
		http.NotFound(w, r)
		return
	}
	if r.Method == http.MethodGet || r.Method == http.MethodHead {
		if file := files.openStored(area, entry); file != nil {
			serveFile(w, r, file, entry.Path)
		} else {
			http.NotFound(w, r)
		}
		return
	}
	if r.Header.Get("Origin") != origin || r.Header.Get("X-Wanxiang-Update") != "1" {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	target := files.diskPath(area, entry)
	var err error
	switch r.Method {
	case http.MethodPut:
		err = writeStored(target, area, entry, r.Body)
	case http.MethodDelete:
		err = os.Remove(target)
		if errors.Is(err, os.ErrNotExist) {
			err = nil
		}
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	if err != nil {
		log.Print(err)
		http.Error(w, "Local update storage failed", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (files *webFiles) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	if r.Host != address {
		http.Error(w, "Host mismatch", http.StatusBadRequest)
		return
	}
	if strings.HasPrefix(r.URL.Path, updatePrefix) {
		files.serveUpdate(w, r)
		return
	}
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	name := strings.TrimPrefix(r.URL.Path, "/")
	if name == "" {
		name = "index.html"
	}
	if name != path.Clean(name) || !filepath.IsLocal(name) || strings.Contains(name, "\\") {
		http.NotFound(w, r)
		return
	}
	if entry, found := files.deferred[name]; found {
		if file := files.openStored("verified", entry); file != nil {
			serveFile(w, r, file, name)
			return
		}
	}
	file, err := files.bundled.Open(filepath.FromSlash(name))
	if err != nil {
		http.NotFound(w, r)
		return
	}
	serveFile(w, r, file, name)
}

func run() error {
	executable, err := os.Executable()
	if err != nil {
		return err
	}
	data := os.Getenv("LOCALAPPDATA")
	if data == "" {
		return errors.New("LOCALAPPDATA is missing")
	}
	files, err := loadFiles(filepath.Join(filepath.Dir(executable), "www"),
		filepath.Join(data, "WanxiangTavern", "updates", "v1"))
	if err != nil {
		return err
	}
	defer files.bundled.Close()
	if err := mime.AddExtensionType(".mjs", "text/javascript"); err != nil {
		return err
	}
	if err := mime.AddExtensionType(".js", "text/javascript"); err != nil {
		return err
	}
	listener, err := net.Listen("tcp4", address)
	if err != nil {
		return fmt.Errorf("cannot start on %s: %w", address, err)
	}
	defer listener.Close()
	fmt.Printf("Wanxiang Tavern: %s/\nClose this window to stop.\n", origin)
	if err := exec.Command("rundll32.exe", "url.dll,FileProtocolHandler", origin+"/").Start(); err != nil {
		log.Print(err)
	}
	server := &http.Server{Handler: files, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 2 * time.Minute}
	return server.Serve(listener)
}

func main() {
	if err := run(); err != nil {
		log.Print(err)
		fmt.Print("Press Enter to close.")
		fmt.Scanln()
	}
}
