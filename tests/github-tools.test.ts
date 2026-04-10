import { describe, it, expect } from 'vitest';

describe('GitHub tools', () => {
  it('should export all five tools', async () => {
    const { githubTools } = await import('../src/tools/github.js');
    expect(githubTools.github_list_repos).toBeDefined();
    expect(githubTools.github_list_directory).toBeDefined();
    expect(githubTools.github_read_file).toBeDefined();
    expect(githubTools.github_search_code).toBeDefined();
    expect(githubTools.github_get_commit_history).toBeDefined();
  });

  it('should export combined allTools from index', async () => {
    const { allTools } = await import('../src/tools/index.js');
    expect(allTools.github_list_repos).toBeDefined();
    expect(allTools.github_read_file).toBeDefined();
  });
});
