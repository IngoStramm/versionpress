/// <reference path='../Commits/Commits.d.ts' />
/// <reference path='../interfaces/State.d.ts' />

import * as React from 'react';
import * as ReactRouter from 'react-router';
import * as request from 'superagent';
import * as moment from 'moment';
import * as Promise from 'core-js/es6/promise';
import * as classNames from 'classnames';
import update = require('react-addons-update');

import BulkActionPanel from '../bulk-action-panel/BulkActionPanel';
import CommitPanel from '../commit-panel/CommitPanel';
import CommitsTable from '../Commits/CommitsTable.react';
import Filter from '../filter/Filter';
import FlashMessage from '../common/flash-message/FlashMessage';
import ProgressBar from '../common/progress-bar/ProgressBar';
import ServicePanel from '../service-panel/ServicePanel';
import VpTitle from '../vp-title/VpTitle';
import WelcomePanel from '../welcome-panel/WelcomePanel';
import * as revertDialog from '../Commits/revertDialog';
import * as WpApi from '../services/WpApi';
import {indexOf} from '../Commits/CommitUtils';
import config from '../config';

import './HomePage.less';

const routes = config.routes;

interface HomePageProps extends React.Props<JSX.Element> {
  params: {
    page?: string,
  };
}

interface HomePageState {
  pages?: number[];
  query?: string;
  commits?: Commit[];
  selectedCommits?: Commit[];
  lastSelectedCommit?: Commit;
  message?: InfoMessage;
  isLoading?: boolean;
  displayServicePanel?: boolean;
  displayWelcomePanel?: boolean;
  displayUpdateNotice?: boolean;
  isDirtyWorkingDirectory?: boolean;
  progress?: number;
}

export default class HomePage extends React.Component<HomePageProps, HomePageState> {

  static contextTypes: React.ValidationMap<any> = {
    router: React.PropTypes.func.isRequired,
  };

  state = {
    pages: [],
    query: '',
    commits: [],
    selectedCommits: [],
    lastSelectedCommit: null,
    message: null,
    isLoading: true,
    displayServicePanel: false,
    displayWelcomePanel: false,
    displayUpdateNotice: false,
    isDirtyWorkingDirectory: false,
    progress: 100,
  };

  private refreshInterval;

  static getErrorMessage(res: request.Response, err: any) {
    if (res) {
      const body = res.body;
      if ('code' in body && 'message' in body) {
        return body;
      }
    }
    console.error(err);
    return {
      code: 'error',
      message: 'VersionPress is not able to connect to WordPress site. Please try refreshing the page.',
      details: err,
    };
  }

  private updateProgress = (e: {percent: number}) => {
    this.setState({
      progress: e.percent,
    });
  };

  componentDidMount() {
    this.fetchWelcomePanel();
    this.fetchCommits();
    this.refreshInterval = setInterval(() => this.checkUpdate(), 10 * 1000);
  }

  componentWillReceiveProps(nextProps: HomePageProps) {
    this.fetchCommits(nextProps.params);
  }

  componentWillUnmount() {
    clearInterval(this.refreshInterval);
  }

  fetchCommits = (params = this.props.params) => {
    const router: ReactRouter.Context = (this.context as any).router;
    this.setState({
      isLoading: true,
      progress: 0,
    });

    const page = (parseInt(params.page, 10) - 1) || 0;

    if (page < 1) {
      router.transitionTo(routes.home);
    }

    WpApi
      .get('commits')
      .query({page: page, query: encodeURIComponent(this.state.query)})
      .on('progress', this.updateProgress)
      .end((err: any, res: request.Response) => {
        const data = res.body.data as VpApi.GetCommitsResponse;
        if (err) {
          this.setState({
            pages: [],
            commits: [],
            message: HomePage.getErrorMessage(res, err),
            isLoading: false,
            displayUpdateNotice: false,
          });
        } else {
          this.setState({
            pages: data.pages.map(c => c + 1),
            commits: data.commits,
            message: null,
            isLoading: false,
            displayUpdateNotice: false,
          });
          this.checkUpdate();
        }
      });
  };

  fetchWelcomePanel = () => {
    WpApi
      .get('display-welcome-panel')
      .end((err: any, res: request.Response) => {
        const data = res.body.data as VpApi.DisplayWelcomePanelResponse;
        if (err) {
          return;
        }

        if (data === true) {
          this.setState({
            displayWelcomePanel: true,
          });
        } else {
          this.setState({
            displayWelcomePanel: false,
          });
        }
      });
  };

  checkUpdate = () => {
    if (!this.state.commits.length || this.state.isLoading) {
      return;
    }

    WpApi
      .get('should-update')
      .query({query: encodeURIComponent(this.state.query), latestCommit: this.state.commits[0].hash})
      .end((err: any, res: request.Response) => {
        const data = res.body.data as VpApi.ShouldUpdateResponse;
        if (err) {
          this.setState({
            displayUpdateNotice: false,
            isDirtyWorkingDirectory: false,
          });
          clearInterval(this.refreshInterval);
        } else {
          this.setState({
            displayUpdateNotice: !this.props.params.page && data.update === true,
            isDirtyWorkingDirectory: data.cleanWorkingDirectory !== true,
          });
        }
      });
  };

  undoCommits = (commits: string[]) => {
    this.setState({
      isLoading: true,
      progress: 0,
    });

    WpApi
      .get('undo')
      .query({commits: commits})
      .on('progress', this.updateProgress)
      .end((err: any, res: request.Response) => {
        if (err) {
          this.setState({
            message: HomePage.getErrorMessage(res, err),
            isLoading: false,
          });
        } else {
          const router: ReactRouter.Context = (this.context as any).router;
          router.transitionTo(routes.home);
          document.location.reload();
        }
      });
  };

  rollbackToCommit = (hash: string) => {
    this.setState({
      isLoading: true,
      progress: 0,
    });

    WpApi
      .get('rollback')
      .query({commit: hash})
      .on('progress', this.updateProgress)
      .end((err: any, res: request.Response) => {
        if (err) {
          this.setState({
            message: HomePage.getErrorMessage(res, err),
            isLoading: false,
          });
        } else {
          const router: ReactRouter.Context = (this.context as any).router;
          router.transitionTo(routes.home);
          document.location.reload();
        }
      });
  };

  onServicePanelClick = () => {
    this.setState({
      displayServicePanel: !this.state.displayServicePanel,
    });
  };

  onCommitSelect = (commits: Commit[], isChecked: boolean, isShiftKey: boolean) => {
    let { selectedCommits, lastSelectedCommit } = this.state;
    const bulk = commits.length > 1;

    commits
      .filter((commit: Commit) => commit.canUndo)
      .forEach((commit: Commit) => {
        let lastIndex = -1;
        const index = indexOf(this.state.commits, commit);

        if (!bulk && isShiftKey) {
          const last = this.state.lastSelectedCommit;
          lastIndex = indexOf(this.state.commits, last);
        }

        if (lastIndex === -1) {
          lastIndex = index;
        }

        const step = (index < lastIndex ? -1 : 1);
        const cond = index + step;
        for (let i = lastIndex; i !== cond; i += step) {
          const currentCommit = this.state.commits[i];
          const index = indexOf(selectedCommits, currentCommit);
          if (isChecked && index === -1) {
            selectedCommits = update(selectedCommits, {$push: [currentCommit]});
          } else if (!isChecked && index !== -1) {
            selectedCommits = update(selectedCommits, {$splice: [[index, 1]]});
          }
          lastSelectedCommit = currentCommit;
        }
      });

    this.setState({
      selectedCommits: selectedCommits,
      lastSelectedCommit: (bulk ? null : lastSelectedCommit),
    });
  };

  onBulkAction = (action: string) => {
    if (action === 'undo') {
      const { selectedCommits } = this.state;
      const count = selectedCommits.length;

      const title = (
        <span>Undo <em>{count} {count === 1 ? 'change' : 'changes'}</em>?</span>
      );
      const hashes = selectedCommits.map((commit: Commit) => commit.hash);

      revertDialog.revertDialog.call(this, title, () => this.undoCommits(hashes));
    }
  };

  onClearSelection = () => {
    this.setState({
      selectedCommits: [],
      lastSelectedCommit: null,
    });
  };

  onCommit = (message: string) => {
    this.setState({
      progress: 0,
    });

    const values = { 'commit-message': message };

    WpApi
      .post('commit')
      .send(values)
      .on('progress', this.updateProgress)
      .end((err: any, res: request.Response) => {
        if (err) {
          this.setState({
            message: HomePage.getErrorMessage(res, err),
          });
        } else {
          this.setState({
            isDirtyWorkingDirectory: false,
            message: {
              code: 'updated',
              message: 'Changes have been committed.',
            },
          });
          this.fetchCommits();
        }
        return !err;
      });
  };

  onDiscard = () => {
    this.setState({
      progress: 0,
    });

    WpApi
      .post('discard-changes')
      .on('progress', this.updateProgress)
      .end((err: any, res: request.Response) => {
        if (err) {
          this.setState({
            message: HomePage.getErrorMessage(res, err),
          });
        } else {
          this.setState({
            isDirtyWorkingDirectory: false,
            message: {
              code: 'updated',
              message: 'Changes have been discarded.',
            },
          });
        }
        return !err;
      });
  };

  onFilterQueryChange = (query: string) => {
    this.setState({
      query: query,
    });
  };

  onFilter = () => {
    const page = (parseInt(this.props.params.page, 10) - 1) || 0;
    if (page > 0) {
      const router: ReactRouter.Context = (this.context as any).router;
      router.transitionTo(routes.home);
    } else {
      this.fetchCommits();
    }
  };

  onUndo = (e) => {
    e.preventDefault();
    const hash = e.target.getAttribute('data-hash');
    const message = e.target.getAttribute('data-message');
    const title = (
      <span>Undo <em>{message}</em>?</span>
    );

    revertDialog.revertDialog.call(this, title, () => this.undoCommits([hash]));
  };

  onRollback = (e) => {
    e.preventDefault();
    const hash = e.target.getAttribute('data-hash');
    const date = moment(e.target.getAttribute('data-date')).format('LLL');
    const title = (
      <span>Roll back to <em>{date}</em>?</span>
    );

    revertDialog.revertDialog.call(this, title, () => this.rollbackToCommit(hash));
  };

  onWelcomePanelHide = (e: React.MouseEvent) => {
    e.preventDefault();

    this.setState({
      displayWelcomePanel: false,
    });

    WpApi
      .post('hide-welcome-panel')
      .end((err: any, res: request.Response) => {
        this.fetchCommits();
      });
  };

  getGitStatus = () => {
    return new Promise(function(resolve, reject) {
      WpApi
        .get('git-status')
        .end((err, res: request.Response) => {
          const data = res.body.data as VpApi.GetGitStatusResponse;
          if (err) {
            reject(HomePage.getErrorMessage(res, err));
          } else {
            resolve(data);
          }
        });
    });
  };

  getDiff = (hash: string) => {
    const query = hash === '' ? null : {commit: hash};

    return new Promise(function(resolve, reject) {
      WpApi
        .get('diff')
        .query(query)
        .end((err, res: request.Response) => {
          const data = res.body.data as VpApi.GetDiffResponse;
          if (err) {
            reject(HomePage.getErrorMessage(res, err));
          } else {
            resolve(data.diff);
          }
        });
    });
  };

  render() {
    const enableActions = !this.state.isDirtyWorkingDirectory;

    const homePageClassName = classNames({
      'loading': this.state.isLoading,
    });

    return (
      <div className={homePageClassName}>
        <ProgressBar progress={this.state.progress} />
        <ServicePanel
          isVisible={this.state.displayServicePanel}
          onButtonClick={this.onServicePanelClick}
        >
          <VpTitle />
          {this.state.message &&
            <FlashMessage message={this.state.message} />
          }
        </ServicePanel>
        {this.state.isDirtyWorkingDirectory
          ? <CommitPanel
              diffProvider={{ getDiff: this.getDiff }}
              gitStatusProvider={{ getGitStatus: this.getGitStatus }}
              onCommit={this.onCommit}
              onDiscard={this.onDiscard}
            />
          : null
        }
        {this.state.displayWelcomePanel &&
          <WelcomePanel onHide={this.onWelcomePanelHide} />
        }
        {this.state.displayUpdateNotice
          ? <div className='updateNotice'>
              <span>There are newer changes available.</span>
              <a
                href='#'
                onClick={(e) => { e.preventDefault(); this.fetchCommits(); }}
              >Refresh now.</a>
            </div>
          : null
        }
        <div className='tablenav top'>
          <Filter
            query={this.state.query}
            onQueryChange={this.onFilterQueryChange}
            onFilter={this.onFilter}
          />
          <BulkActionPanel
            enableActions={enableActions}
            onBulkAction={this.onBulkAction}
            onClearSelection={this.onClearSelection}
            selectedCommits={this.state.selectedCommits}
          />
        </div>
        <CommitsTable
          currentPage={parseInt(this.props.params.page, 10) || 1}
          pages={this.state.pages}
          commits={this.state.commits}
          selectedCommits={this.state.selectedCommits}
          enableActions={enableActions}
          onCommitSelect={this.onCommitSelect}
          onUndo={this.onUndo}
          onRollback={this.onRollback}
          diffProvider={{ getDiff: this.getDiff }}
        />
      </div>
    );
  }

}
