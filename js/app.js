"use strict";
jQuery(document).ready(function() {
    var posWatchID, 
    distWatchID,
    tours = [],
    appPosition,
    posOptions = {enableHighAccuracy: true};    


    var appPosChange = function(pos) {
        if (pos){
            var newLatlng = new google.maps.LatLng(pos.coords.latitude, pos.coords.longitude);
            $("#localtours li").trigger({type:"newPosition",position:newLatlng});
        }
    };
    
    var appPosFail = function (err) {
        if (err){
            console.warn('ERROR(' + err.code + '): ' + err.message);
        }
    };


    distWatchID = navigator.geolocation.watchPosition(appPosChange, appPosFail, posOptions);       

    // create a new api endpoint
    var localwiki = new WikiAPI({
        url: 'http://www.tulsawiki.org'
    })

    //html render funcions
    
    var objectsetas_listitems = function (obj,link_uri,link_name){
        var pages_html="",
            pages=obj.objects;

        link_name = ((link_name in pages[0]) && link_name) || "name";
        link_uri  = ((link_uri  in pages[0]) && link_uri)  || "resource_uri";

        for (var p=0; p < pages.length; p++){
             pages_html+="<li><a\
             data-resource_uri='"+pages[p][link_uri]+"'>\
             "+pages[p][link_name]+"</a></li>"        
        };
        return pages_html;
    };

// app functions
   
    var detail_click = function(event) {
        if ($(event.target).attr('rel') != 'external'){
          event.preventDefault();
        }
        var this_uri=$(this).data('resource_uri'),display_page;
        
        if (event.data) {
            display_page = event.data.display_page || "page_detail"
        } else {
            display_page = "page_detail"
        }
        $("#"+display_page).data('resource_uri',this_uri)
        $.mobile.changePage("#"+display_page);
    };
    
    var add_more_link = function (listview, resource){
        $("li:last-child", listview).after("<li>\
        <a class='ui-link wiki-paginate' data-wiki-next='"+resource+"' ><strong>More</strong></a></li>")
        $(".wiki-paginate").on("click", next_page); 
    };

    var next_page = function (event){
        event.preventDefault();
        $.mobile.loading( 'show', {
            text: 'Getting more',
            textVisible: true,
        })
        var next=$(this).data("wiki-next"),
            calling_list=$(this).parents("[data-role='listview']");
            
        localwiki.next(next,calling_list)
            .done(function(caller,obj){
                caller.html(Mustache.render("{{#objects}}<li><a data-resource_uri=''>{{username}}</a></li>{{/objects}}",obj));
                $("li a", caller).on('click', detail_click);    
                $(".wiki-paginate").click(next_page); 
                add_more_link(caller,obj.meta.next);
                caller.listview('refresh').trigger( "create" );
                $.mobile.loading('hide');
            })
            .fail(function(){
                $.mobile.loading('hide');
            });            
    };
    
//jqm page behavior     
    $("#pages").on("pageinit",function(){
        localwiki.pages()
            .done(
                function(obj){
                    $("#pagelist").html(Mustache.render(templates.pages,obj));
                    add_more_link($("#pagelist"),obj.meta.next);
                    $('#pagelist li a').on('click',{'display_page':'page_detail'}, detail_click);    
                    $("#pagelist").listview('refresh').trigger( "create" );
                });            
    });   
    
    $("#page_detail").on("pageshow",function(){
        localwiki.page($(this).data("resource_uri"))
            .done(function(obj){
                // TODO: remove tulsawiki hard-code when we support more localwikis
                var read_more_wiki = 'tulsawiki.org';
                var read_more_href = 'http://' + read_more_wiki + '/' + obj.name;
                $("#page_title").text(obj.name);
                $("#detailist").html("<li>"+obj.content+'</li><li><a rel="external" href="'+read_more_href+'">Read More on '+read_more_wiki+'</a></li>').listview('refresh').trigger( "create" );  
                $('#detailist a').on('click',{'display_page':'page_detail'}, detail_click);    
                
                if (obj.map){
                    localwiki.call_api(obj.map)
                        .done(function (data) {
                            $("#detailist li:first-child").before("<li><div><div id='map_content' data-role='content'></div></div></li>");
                            var ttown= tour_map(document.getElementById("map_content"));
                            var pageGeos = new gglGeometries();
                            pageGeos.addGeos(data.geom.geometries);
                            pageGeos.setMap(ttown);
                            ttown.fitBounds(pageGeos.bounds());
                        });//end map done
                }
        });//end page done
    });

    $("#tours").on("pageinit",function(){
        // localwiki.pages({"page_tags__tags__slug":"localtour"}).
        localwiki.map({"page__page_tags__tags__slug":"localtour","full":"true"}).
            done(function(response){
                tours = response.objects;
                
                _.each(tours,function(page){
                    var pageGeos = new gglGeometries();
                    pageGeos.addGeos(page.geom.geometries);                    
                    page.lat = pageGeos.center().lat();
                    page.lng = pageGeos.center().lng()
                });
                
                $("#localtours").html(Mustache.render(templates.tours,response));
                $('#localtours li a').on('click',{'display_page':'tour_detail'}, detail_click);    
                add_more_link($("#localtours"),response.meta.next);
                $("#localtours").listview('refresh').trigger('create');
                
                $("#localtours li").on("newPosition",function(e){
                   var li_position = new google.maps.LatLng($(this).data("center-lat"),$(this).data("center-lng"));
                   var distance_to_page=google.maps.geometry.spherical.computeDistanceBetween(li_position,e.position);
                   $(".distance",this).html(Math.round(distance_to_page,-1)+" meters from you.");
                });
            });
    });
    
    $("#tour_detail").on("pageshow",function(){
        var tourGeos = new gglGeometries();
        $("#tourlist").html("");
        localwiki.page($(this).data("resource_uri"))
            .done(function(tour_page){
                    var tour_name = tour_page.name,
                    points = [],
                    point_lis = $(tour_page.content).filter('ul, ol').children('li'),
                    lis = '';
                $("#tour_detail h1.ui-title").html(tour_name);
                for(var _i=0; _i < point_lis.length; _i++){
                    var point = {}, text, url,
                        pnt = point_lis.eq(_i);
                    text = pnt.children().not('ul, ol'),
                    point.name = text.text(),
                    point.url = text.attr('href');

                    localwiki.call_api('/api/map/'+point.url)
                        .done(function(data){
                            tourGeos.addGeos(data.geom.geometries);
                        })
                        .fail(function (data){
                            console.log("call_api Fail:",data);
                        });

                    point.description = pnt.children('ul, ol');
                    point.resource_uri = '/api/page/'+point.url
                    points.push(point);
                };
                tour_page.points = points;
                lis = Mustache.render(templates.tourPoint,tour_page)
                $("#page_title").text(tour_page.name);
                if(lis){
                    $("#tourlist").html(lis);                    
                }else{
        		    $("#tourlist").html("<li>No tour stops listed yet.</li>");
                }
                
                localwiki.call_api(tour_page.map)
                    .done(function (data) {
                        
                        $("#tourlist li:first-child").before("<li><div><div id='tour_map' data-role='content'></div></div></li>");

                        var ttown = new tour_map(document.getElementById("tour_map"));
                        
                        tourGeos.addGeos(data.geom.geometries);
                        
                        tourGeos.setMap(ttown);
                        
                        ttown.fitBounds(tourGeos.bounds());
                        
                        posWatchID = posWatchID || navigator.geolocation.watchPosition(ttown.posChange, ttown.posFail, posOptions);       

                    });//end map done
		$('#tourlist a.tour_point').on('click',{'display_page':'page_detail'}, detail_click);    
		$('#tourlist').listview('refresh');
            });//end page done
        $("#tourlist").listview('refresh').trigger( "create" );
    });

    $("#tour_detail").on("pagehide",function(){
        navigator.geolocation.clearWatch(posWatchID);
    });
    
    
    // localwiki.uri("/api/map/",{"page__page_tags__tags__slug__icontains":"localtour"}).done(function(data){
    //     debugger;
    // })
    // localwiki.uri("/api/page/",{"slug__icontains":"Running"}).done(function(data){
    //     debugger;
    // })

    $("#tags").on("pageinit",function(){
        $("#tags").on('click', 'a[data-resource_uri]', detail_click);
        // grab current tags
        localwiki.tags()
            .done(function(obj){
                var $tagList = $("#taglist");
                $tagList.html(objectsetas_listitems(obj,null,"name"));
                // add more link to bottom of list
                add_more_link($tagList, obj.meta.next);
                $tagList.listview('refresh').trigger('create');
                // when a user searches for an item wait before sending an api request
                $tagList.on('listviewbeforefilter', _.debounce(function(e, data){
                    var $input = $(data.input),
                        tag = $input.val().toLowerCase();
                    // only send requests when we have tag
                    if (tag && tag.length >= 3) {
                        $tagList.listview('refresh');
                        $.mobile.loading('show', {
                            text: 'Looking for tags…',
                            textVisible: true,
                        })
                        localwiki.call_api('/api/tag', {
                            'slug__icontains': tag
                        }).done(function(results){
                            // Do we have results?
                            $.mobile.loading('hide');
                            if (results.meta.total_count <= 0) {
                                $('#tags_no_results').popup('option', 'positionTo', 'window');
                                $('#tags_no_results').popup('open');
                                return
                            }
                            $tagList.html(objectsetas_listitems(results, null, 'name'));
                            if (results.meta.next) {
                                add_more_link($tagList, results.meta.next);
                            }
                            $tagList.listview('refresh');
                            $tagList.trigger('updatelayout');
                        }).fail(function(){
                            $.mobile.loading('hide');
                        });
                    }
                }, 600));
            });
    });    



}); //end document ready

