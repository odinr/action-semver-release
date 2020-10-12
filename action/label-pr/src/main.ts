import * as core from '@actions/core';
import { context, getOctokit } from '@actions/github';

type CommitInfo = { message: string, url: string, sha: string, labels: string[] }
const gg = 'opened'// 'reopened';
const rules = {
  enhancement: /^feat|^new/i,
  bug: /^fix|^bug/i,
  documentation: /^doc/i,
  internal: /^refactor|^style/i,
  performance: /^perf/i,
  breaking: /^(?!revert).*BREAKING CHANGE/mi,
}

const emojis = {
  enhancement: ':rocket:',
  bug: ':bug:',
  documentation: ':books:',
  internal: ':house:',
  performance: ':chart_with_upwards_trend:',
  breaking: ':rotating_light:',
}

const match = (msg: string) => Object.keys(rules).filter(label => !!msg.match(rules[label]));
const extract = (commits: CommitInfo[]) => {
  const labels = commits.reduce((c, v) => c.concat(v.labels), [] as string[]);
  return [...new Set(labels)];
}

const createLog = (commits: CommitInfo[]) => {
  return Object.keys(rules).map(type => {
    const selection = commits.filter(commit => commit.labels.includes(type));
    const messages = selection.map(commit => [`[#${commit.sha.slice(0, 7)}](${commit.url})`, commit.message.replace(/^\w+[:]?\s?/, '')].join(' - '))
    return messages.length ? `## ${emojis[type]} ${type}\n\n${messages.join("\n")}` : '';
  }).join("\n")
}

const getCommits = async (): Promise<CommitInfo[]> => {
  const client = getOctokit(core.getInput('token', { required: true }));
  const [owner, repo] = core.getInput('repository', { required: true }).split('/');
  const pull_number = +core.getInput('pull_number', { required: true });
  try {
    const commits: CommitInfo[] = [];
    for await (const response of client.paginate.iterator(client.pulls.listCommits, { repo, owner, pull_number })) {
      for (const commit of response.data) {
        const { sha, commit: { message, url } } = commit;
        commits.push({ sha, message, url, labels: match(message) });
      }
    }
    return commits;
  } catch (error) {
    throw Error(error.message);
  }
}

const main = async () => {
  const client = getOctokit(core.getInput('token', { required: true }));
  const [owner, repo] = core.getInput('repository', { required: true }).split('/');
  const pull_number = +core.getInput('pull_number', { required: true });
  const update = !!core.getInput('update');
  const before = core.getInput('before');
  try {
    const commits = await getCommits();
    const labels = extract(
      update ? commits.slice(commits.findIndex(commit => commit.sha === before) + 1) : commits
    );
    const log = createLog(commits);
    await client.pulls.update({
      owner, repo,
      pull_number,
      body: log
    })
    await client.issues.addLabels({
      owner, repo, issue_number: pull_number, labels
    })
  } catch (error) {
    core.setFailed(error.message);
  }
};

main();
