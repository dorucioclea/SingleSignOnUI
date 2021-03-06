import { Component, OnInit, ViewChild, AfterViewInit } from "@angular/core";
import { Subscription, Subject } from "rxjs";
import {
  MatPaginator,
  MatSort,
  Sort,
  PageEvent
} from "@angular/material";
import { SelectionModel } from "@angular/cdk/collections";
import { MessagingService } from "src/app/services/messaging.service";
import { MediaObserver, MediaChange } from "@angular/flex-layout";
import { ActivatedRoute, Router } from "@angular/router";
import { ClientService } from "../client.service";
import { ClientScope } from "../models/client-scope";
import { DataSourceResponse } from "src/app/Modules/dataSource-response";
import { DataSourceRequest } from "src/app/Modules/dataSource-request";
import { DatasourceSort } from "src/app/Modules/datasource-sort.";
import { debounceTime, distinctUntilChanged } from "rxjs/operators";
import { DataSourceSortDirection } from "src/app/Modules/dataSource-sort-direction";
import { DataSourceRequestFilter } from 'src/app/Modules/dataSource-request-filter';
import { DataSourceOperator } from 'src/app/Modules/dataSource-operator';
import { DataSourceLogic } from 'src/app/Modules/dataSource-logic';
import * as XLSX from 'xlsx';

@Component({
  selector: "app-scope-list",
  templateUrl: "./scope-list.component.html",
  styleUrls: ["./scope-list.component.scss"]
})
export class ScopeListComponent implements OnInit {
  public expanded = false;
  isDesktop = false;
  watcher: Subscription;
  activeMediaQuery = "";
  filteredText = "";
  xsClass = "tool-bar-small";
  displayedColumns: string[] = [];
  isLoadingResults = true;
  regExpr: any;
  refreshTimer: any;
  refreshInterval = 60 * 5; // 5 minutes
  actionIcon = "edit";
  pageTitle = "";
  messageService: MessagingService;
  clientId: number;
  service: ClientService;

  searchUpdate = new Subject<string>();
  dataSource: DataSourceResponse<ClientScope[]>;
  selection = new SelectionModel<ClientScope>(true, []);
  dataSourceRequest = new DataSourceRequest();
  searchFilter = "";
  private paginator: MatPaginator;
  private sort: MatSort;

  @ViewChild(MatSort, { static: false }) set matSort(ms: MatSort) {
    this.sort = ms;
    if (this.sort) {
      if (this.dataSourceRequest.sort.length > 0) {
        this.sort.active = this.dataSourceRequest.sort[0].field;
        this.sort.direction = this.dataSourceRequest.sort[0].ReturnMastsortDirection();
      }
    }
  }

  @ViewChild(MatPaginator, { static: false }) set matPaginator(
    mp: MatPaginator
  ) {
    this.paginator = mp;
    this.setPaginatorValues();
  }

  setPaginatorValues() {
    if (this.paginator) {
      this.paginator.length = this.dataSource.total;
      this.paginator.pageIndex = this.dataSourceRequest.currentPage;
      this.paginator.pageSize = this.dataSourceRequest.pageSize;
    }
  }

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    mediaObserver: MediaObserver,
    service: ClientService,
    messageService: MessagingService
  ) {
    this.messageService = messageService;
    this.service = service;

    this.dataSourceRequest.pageSize = 10;
    this.dataSourceRequest.sort.push(
      new DatasourceSort("scope", DataSourceSortDirection.Desc)
    );

    // Debounce search.
    this.searchUpdate
      .pipe(debounceTime(400), distinctUntilChanged())
      .subscribe(async value => {
        await this.onSearch(value);
      });

    this.dataSource = new DataSourceResponse<ClientScope[]>();
    this.dataSource.data = new Array<ClientScope>();

    this.watcher = mediaObserver.media$.subscribe((change: MediaChange) => {
      this.activeMediaQuery = change
        ? `'${change.mqAlias}' = (${change.mediaQuery})`
        : "";
      if (change.mqAlias == "xs") {
        this.isDesktop = false;
      } else {
        this.isDesktop = true;
      }
    });
  }

  async ngOnInit() {
    this.clientId = parseInt(this.route.snapshot.paramMap.get("id"));
    this.InitializeGridColumns();
    this.startAutoRefresh();
    this.dataSource = await this.loadData(false);
  }

  public toggleDisplayFilter(): void {
    this.expanded = !this.expanded;
  }

  InitializeGridColumns() {
    this.displayedColumns.push("select");
    this.displayedColumns.push("scope");
    this.displayedColumns.push("remove");
  }

  async loadData(all:boolean) : Promise<DataSourceResponse<ClientScope[]>> {
        this.isLoadingResults = true;
        const originalRequest = this.dataSourceRequest.pageSize;

        try {
            if (all)
            {
                this.dataSourceRequest.pageSize = 0;
            }
            
            const result = await this.service.returnClientScopes(this.dataSourceRequest, this.clientId).toPromise();

            if (all)
            {
                this.dataSourceRequest.pageSize = originalRequest;
            }

            const mappedData = [... result.data].map((row: ClientScope) => {
                return row;
            });
            this.isLoadingResults = false;
            return result;
        } catch (err) {
            this.messageService.displayMessage('Failed loading client scopes');

            if (all)
            {
                this.dataSourceRequest.pageSize = originalRequest;
            }

            this.isLoadingResults = false;
        }
    }

    startAutoRefresh() {
        this.refreshTimer = setInterval(async () => {
            await this.refresh();
        }, this.refreshInterval * 1000);
    }

    pauseAutoRefresh() {
        clearInterval(this.refreshTimer);
    }

    async refresh() {
      this.dataSource = await this.loadData(false);
  }

  async onSearch(value: string): Promise<void> {
      value = value || '';
      value = value.trim().toLowerCase();

      if (value !== '')
      {
          this.dataSourceRequest.filter = new DataSourceRequestFilter("Scope.ToLower()", DataSourceOperator.Contains,value == '' ? null : value, DataSourceLogic.Or)
      }
      else
      {
          this.dataSourceRequest.filter = new DataSourceRequestFilter(null, DataSourceOperator.None,null, DataSourceLogic.None);
      }

      this.dataSource = await this.loadData(false);
  }

  public clearFilters()
  {
      this.dataSourceRequest.filter = new DataSourceRequestFilter(null, DataSourceOperator.None,null, DataSourceLogic.None);
      this.searchFilter = "";
  }

  
  async pagingChanged(pageEvent: PageEvent) {
      this.dataSourceRequest.currentPage = pageEvent.pageIndex;
      this.dataSourceRequest.pageSize = pageEvent.pageSize;
      this.dataSource = await this.loadData(false);
  }

  async sortData(sortChange: Sort) {
      this.dataSourceRequest.sort = new Array<DatasourceSort>();

      if (sortChange.direction !== '') {
          this.dataSourceRequest.sort.push(new DatasourceSort(this.sort.active, DataSourceSortDirection.None));
          this.dataSourceRequest.sort[0].updateDirectionByMatSort(sortChange.direction);
      }

      this.dataSource = await this.loadData(false);
  }

  sortDirection() {
      if (this.dataSourceRequest.sort.length > 0)
      {
          return this.dataSourceRequest.sort[0].dir;
      }

      return '';
  }

  sortActive() {
      if (this.dataSourceRequest.sort.length > 0)
      {
          return this.dataSourceRequest.sort[0].field;
      }

      return ""; 
  }

  async export()
  {
      const dataExport = await this.loadData(true);
      const workSheet = XLSX.utils.json_to_sheet(dataExport.data, {header:[]});
      const workBook: XLSX.WorkBook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workBook, workSheet, 'SheetName');
      XLSX.writeFile(workBook, 'ClientScopes.xlsx');
  }

  isAllSelected(): boolean {
    const numSelected = this.selection.selected.length;
    const numRows = this.dataSource.data.length;
    return numSelected === numRows;
  }

  masterToggle(): void {
    this.isAllSelected()
      ? this.selection.clear()
      : this.dataSource.data.forEach(row => this.selection.select(row));
  }

  goBack() {
    this.router.navigate(["/clients"]);
    return true;
  }

  async removeScopes() {
    try {
      this.isLoadingResults = true;
      await await this.service
        .removeScopesFromClient(this.selection.selected)
        .toPromise();
      this.messageService.displayMessage("Removed scopes");
      this.isLoadingResults = false;
      this.refresh();
    } catch (error) {
      this.messageService.displayMessage("Failed removing scopes");
      this.isLoadingResults = false;
    }
  }

  async removeScope(claim: ClientScope) {
    try {
      this.isLoadingResults = true;
      const scope = new Array<ClientScope>();
      scope.push(claim);
      await this.service.removeScopesFromClient(scope).toPromise();
      this.messageService.displayMessage("Removed scope: " + claim.scope);
      this.isLoadingResults = false;
      this.refresh();
    } catch (error) {
      this.messageService.displayMessage(
        "Failed removing scope: " + claim.scope
      );
      this.isLoadingResults = false;
    }
  }
}
