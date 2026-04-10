import { tool } from 'ai';
import { z } from 'zod';
import { Octokit } from '@octokit/rest';
import * as cfg from '../config.js';

const octokit = new Octokit({ auth: cfg.GITHUB_TOKEN });

export const githubTools = {
  github_list_repos: tool({
    description: 'List repositories in a GitHub organization or for a user. Defaults to org type. Use this to discover what repos exist.',
    parameters: z.object({
      owner: z.string().describe('GitHub org or username'),
      type: z.enum(['org', 'user']).describe('Whether owner is an org or user. Use "org" for organizations, "user" for individual users.'),
    }),
    execute: async ({ owner, type }) => {
      try {
        const qualifier = type === 'org' ? 'org' : 'user';
        const { data } = await octokit.search.repos({ q: `${qualifier}:${owner}`, per_page: 100, sort: 'updated' });
        return data.items.map(r => ({
          name: r.name,
          description: r.description,
          language: r.language,
          updated_at: r.updated_at,
        }));
      } catch (e: any) {
        return { error: `Failed to list repos for ${owner}: ${e.message}` };
      }
    },
  }),

  github_list_directory: tool({
    description: 'List files and folders at a path in a GitHub repo. Use path "" for root. Shows file names, types (file/dir), and paths.',
    parameters: z.object({
      owner: z.string().describe('Repo owner (org or user)'),
      repo: z.string().describe('Repository name'),
      path: z.string().describe('Path within repo. Use empty string "" for root.'),
    }),
    execute: async ({ owner, repo, path }) => {
      try {
        const { data } = await octokit.repos.getContent({ owner, repo, path });
        if (!Array.isArray(data)) {
          return [{ name: data.name, type: data.type, path: data.path }];
        }
        return data.map(item => ({
          name: item.name,
          type: item.type,
          path: item.path,
        }));
      } catch (e: any) {
        return { error: `Failed to list ${owner}/${repo}/${path}: ${e.message}` };
      }
    },
  }),

  github_read_file: tool({
    description: 'Read the contents of a file from a GitHub repo. Returns decoded text content, size, and SHA.',
    parameters: z.object({
      owner: z.string().describe('Repo owner (org or user)'),
      repo: z.string().describe('Repository name'),
      path: z.string().describe('File path within the repo'),
    }),
    execute: async ({ owner, repo, path }) => {
      try {
        const { data } = await octokit.repos.getContent({ owner, repo, path });
        if (Array.isArray(data) || data.type !== 'file') {
          return { error: `${path} is a directory, not a file` };
        }
        const content = Buffer.from(data.content, 'base64').toString('utf-8');
        return { content, size: data.size, sha: data.sha };
      } catch (e: any) {
        return { error: `Failed to read ${owner}/${repo}/${path}: ${e.message}` };
      }
    },
  }),

  github_search_code: tool({
    description: 'Search for code across GitHub repos using the code search API. Optionally scope to an org/user.',
    parameters: z.object({
      query: z.string().describe('Search query (code search syntax)'),
      owner: z.string().describe('Org or user to scope search to. Use empty string "" for global search.'),
    }),
    execute: async ({ query, owner }) => {
      try {
        const q = owner?.length ? `${query} org:${owner}` : query;
        const { data } = await octokit.search.code({ q, per_page: 20 });
        return data.items.map(item => ({
          repo: item.repository.full_name,
          path: item.path,
          url: item.html_url,
        }));
      } catch (e: any) {
        return { error: `Search failed for "${query}": ${e.message}` };
      }
    },
  }),

  github_get_commit_history: tool({
    description: 'View recent commits on a branch or for a specific file in a GitHub repo.',
    parameters: z.object({
      owner: z.string().describe('Repo owner (org or user)'),
      repo: z.string().describe('Repository name'),
      path: z.string().describe('File path to filter commits to. Use empty string "" for all commits.'),
      branch: z.string().describe('Branch name. Use "main" for the default branch.'),
    }),
    execute: async ({ owner, repo, path, branch }) => {
      try {
        const { data } = await octokit.repos.listCommits({
          owner, repo, sha: branch, path: path || undefined, per_page: 20,
        });
        return data.map(c => ({
          sha: c.sha.slice(0, 7),
          message: c.commit.message.split('\n')[0],
          author: c.commit.author?.name ?? 'unknown',
          date: c.commit.author?.date ?? '',
        }));
      } catch (e: any) {
        return { error: `Failed to get commits for ${owner}/${repo}: ${e.message}` };
      }
    },
  }),
};
