package execenv

import (
	"regexp"
	"strings"
)

// repoNameFromURL extracts a short directory name from a git remote URL.
// e.g. "https://github.com/org/my-repo.git" → "my-repo"
func repoNameFromURL(url string) string {
	// Strip trailing slashes and .git suffix.
	url = strings.TrimRight(url, "/")
	url = strings.TrimSuffix(url, ".git")

	// Take the last path segment.
	if i := strings.LastIndex(url, "/"); i >= 0 {
		url = url[i+1:]
	}
	// Also handle SSH-style "host:org/repo".
	if i := strings.LastIndex(url, ":"); i >= 0 {
		url = url[i+1:]
		if j := strings.LastIndex(url, "/"); j >= 0 {
			url = url[j+1:]
		}
	}

	name := strings.TrimSpace(url)
	if name == "" {
		return "repo"
	}
	return name
}

// taskKeyLen is how many hex chars of the task id identify a task in a path or
// a branch name. Every char here is spent twice — the env root prefixes the
// agent's whole workdir, and the branch name becomes a path under
// .git/refs/heads/ inside that workdir — and Windows still enforces MAX_PATH
// (260). The full 32-char id overflows it on a deep checkout, so the segment
// stays short and buys its uniqueness from entropy instead of length.
const taskKeyLen = 12

// taskKey returns the segment identifying a task in a path or branch name: the
// LAST taskKeyLen hex chars of the id.
//
// Which end matters more than how many chars. Task ids are UUIDv7 — 48 bits of
// millisecond timestamp, then randomness. The leading 8 hex chars are the high
// 32 bits of that timestamp, so they only advance once every 2^16 ms (~65.5s):
// taking them from the front gave every task started inside one such window an
// identical segment, and therefore one shared env root. That is not a rare hash
// collision, it is the common case, and it made Prepare's "remove existing env"
// step delete a concurrently running task's directory (#7326).
//
// The tail is drawn from the id's random field, so 12 chars carry 48 random
// bits. Prepare additionally refuses to delete an env root another task owns,
// so even an improbable clash fails closed instead of destroying work.
//
// Use shortID for logs, never for identity.
func taskKey(uuid string) string {
	s := strings.ReplaceAll(uuid, "-", "")
	if len(s) > taskKeyLen {
		return s[len(s)-taskKeyLen:]
	}
	return s
}

// shortID returns the first 8 characters of a UUID string (dashes stripped).
// Display and logging only — see taskKey for anything that must be unique.
func shortID(uuid string) string {
	s := strings.ReplaceAll(uuid, "-", "")
	if len(s) > 8 {
		return s[:8]
	}
	return s
}

var nonAlphanumeric = regexp.MustCompile(`[^a-z0-9]+`)

// sanitizeName produces a git-branch-safe name from a human-readable string.
func sanitizeName(name string) string {
	s := strings.ToLower(strings.TrimSpace(name))
	s = nonAlphanumeric.ReplaceAllString(s, "-")
	s = strings.Trim(s, "-")
	if len(s) > 30 {
		s = s[:30]
		s = strings.TrimRight(s, "-")
	}
	if s == "" {
		s = "agent"
	}
	return s
}

// Longest readable segment allowed in a branch name.
const branchNameSegmentMax = 24

// issueBranchSegment returns the branch segment used for a task branch. Issue
// identifiers are the human-readable source of truth; the task id stays only
// as a short disambiguating suffix, and non-issue tasks fall back to the short
// task key.
func issueBranchSegment(issueIdentifier, taskID string) string {
	label := strings.ToLower(strings.TrimSpace(issueIdentifier))
	label = nonAlphanumeric.ReplaceAllString(label, "-")
	label = strings.Trim(label, "-")
	if label == "" {
		return taskKey(taskID)
	}
	suffix := strings.ToLower(taskKey(taskID))
	if suffix == "" {
		return label
	}
	maxPrefix := branchNameSegmentMax - len(suffix) - 1
	if maxPrefix < 1 {
		maxPrefix = 1
	}
	if len(label) > maxPrefix {
		label = strings.TrimRight(label[:maxPrefix], "-")
	}
	if label == "" {
		label = "issue"
	}
	return label + "-" + suffix
}

func TaskKey(uuid string) string { return taskKey(uuid) }

// IssueBranchSegment exposes the branch-name segment helper to other daemon
// packages.
func IssueBranchSegment(issueIdentifier, taskID string) string {
	return issueBranchSegment(issueIdentifier, taskID)
}
